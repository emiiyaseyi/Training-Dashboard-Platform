import { prisma } from '@/lib/prisma'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'
import type { TrainingRow, FeedbackRow, SubscriptionRow, KSSRow, RosterRow } from '@/lib/excel-parser'

// Shared "write parsed rows into the database" logic — used by both the Excel upload routes
// and the Google Sheets sync engine, so the two paths can never drift out of sync with each
// other. Each function auto-creates any new Business Units it encounters, wraps the batch in
// an UploadBatch record (so it shows in Upload History either way), and bulk-inserts.

async function ensureBusinessUnits(names: string[]) {
  const unique = [...new Set(names.filter(Boolean))]
  for (const name of unique) {
    await prisma.businessUnit.upsert({ where: { name }, update: {}, create: { name, budget: 0, staffCount: 0 } })
  }
}

// Shared across every "records created one at a time through the UI rather than an Excel upload"
// path (native survey responses, manually-added KSS/Subscription records) — every TrainingRecord/
// FeedbackRecord/etc. row requires a batchId, so these get grouped under one reusable batch per
// (type, label) pair instead of creating a new empty batch for every single manual record.
export async function getOrCreateNativeBatch(type: string, filename: string) {
  const existing = await prisma.uploadBatch.findFirst({ where: { type, filename } })
  if (existing) return existing
  return prisma.uploadBatch.create({ data: { type, filename, recordCount: 0 } })
}

export interface ImportResult {
  batchId: string
  recordCount: number
  warnings: string[]
}

export async function importTrainingRows(rows: TrainingRow[], filename: string, period: string | null, warnings: string[] = []): Promise<ImportResult> {
  const year = period ? parseInt(period.split('-')[0]) : new Date().getFullYear()
  const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))
  await ensureBusinessUnits(normalizedRows.map((r) => r.businessUnit))

  const [knownTypes, knownCapabilities] = await Promise.all([
    prisma.trainingType.findMany({ select: { name: true } }),
    prisma.differentiatingCapability.findMany({ select: { name: true } }),
  ])
  const knownTypeNames = new Set(knownTypes.map((t) => t.name.toLowerCase()))
  const knownCapabilityNames = new Set(knownCapabilities.map((c) => c.name.toLowerCase()))
  normalizedRows.forEach((r, i) => {
    if (r.trainingType && !knownTypeNames.has(r.trainingType.toLowerCase())) {
      warnings.push(`Row ${i + 2}: Training Type "${r.trainingType}" not recognised — check Admin → Training Types.`)
    }
    if (r.capability && !knownCapabilityNames.has(r.capability.toLowerCase())) {
      warnings.push(`Row ${i + 2}: Differentiating Capability "${r.capability}" not recognised — check Admin → Capabilities.`)
    }
  })

  const batch = await prisma.uploadBatch.create({
    data: { type: 'training', filename, recordCount: normalizedRows.length, period: period || null },
  })
  await prisma.trainingRecord.createMany({
    data: normalizedRows.map((r) => ({
      serialNo: r.serialNo,
      staffName: r.staffName,
      staffId: r.staffId.toUpperCase(),
      email: r.email || null,
      training: r.training,
      businessUnit: r.businessUnit,
      month: r.month,
      year,
      cost: r.cost,
      hours: r.hours > 0 ? r.hours : null,
      trainingType: r.trainingType || null,
      capability: r.capability || null,
      vendor: r.vendor || null,
      batchId: batch.id,
    })),
  })
  return { batchId: batch.id, recordCount: normalizedRows.length, warnings }
}

function feedbackRecordData(r: FeedbackRow, batchId: string) {
  return {
    staffId: r.staffId ? r.staffId.toUpperCase() : null,
    businessUnit: r.businessUnit,
    trainingTitle: r.trainingTitle,
    role: r.role,
    applicationResponse: r.applicationResponse,
    impactAlignment: r.impactAlignment,
    confidenceRating: r.confidenceRating > 0 ? r.confidenceRating : null,
    roleRelevance: r.roleRelevance > 0 ? r.roleRelevance : null,
    expectationsMet: r.expectationsMet > 0 ? r.expectationsMet : null,
    vendorRating: r.vendorRating > 0 ? r.vendorRating : null,
    vendorName: r.vendorName || null,
    qualitativeResponse: r.qualitativeResponse,
    month: r.month || null,
    batchId,
  }
}

export async function importFeedbackRows(rows: FeedbackRow[], filename: string, period: string | null, warnings: string[] = []): Promise<ImportResult> {
  const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))
  await ensureBusinessUnits(normalizedRows.map((r) => r.businessUnit))

  const batch = await prisma.uploadBatch.create({
    data: { type: 'feedback', filename, recordCount: normalizedRows.length, period: period || null },
  })

  // FeedbackRecord has no name at all, only businessUnit/trainingTitle/ratings — so an old
  // orphaned row (no staffId, uploaded before that column existed) can never have an identity
  // assigned to it by an admin guessing; the only real fix is a RE-UPLOAD of the same data with a
  // Staff ID column added. Without this, that re-upload would just create duplicate rows sitting
  // next to the un-identified originals. Instead, a row that now carries a Staff ID is matched
  // against an existing orphan sharing the same businessUnit + trainingTitle + month +
  // confidenceRating fingerprint (same key dedupeFeedback in sheets-sync.ts uses) and, if found,
  // that orphan's staffId is backfilled in place rather than a new row being created — so
  // re-uploading a corrected sheet actually converges the data instead of doubling it.
  const toCreate: typeof normalizedRows = []
  const claimedOrphanIds = new Set<string>()
  let backfilled = 0

  for (const r of normalizedRows) {
    if (!r.staffId) {
      toCreate.push(r)
      continue
    }
    const rating = r.confidenceRating > 0 ? r.confidenceRating : null
    const orphan = await prisma.feedbackRecord.findFirst({
      where: {
        staffId: null,
        businessUnit: r.businessUnit,
        trainingTitle: r.trainingTitle,
        month: r.month || null,
        confidenceRating: rating,
        id: { notIn: [...claimedOrphanIds] },
      },
    })
    if (orphan) {
      claimedOrphanIds.add(orphan.id)
      await prisma.feedbackRecord.update({ where: { id: orphan.id }, data: { staffId: r.staffId.toUpperCase() } })
      backfilled++
    } else {
      toCreate.push(r)
    }
  }

  if (toCreate.length > 0) {
    await prisma.feedbackRecord.createMany({ data: toCreate.map((r) => feedbackRecordData(r, batch.id)) })
  }
  if (backfilled > 0) {
    warnings.push(`${backfilled} row(s) matched an existing un-identified Feedback record by Business Unit/Training/Month/Rating and had their Staff ID filled in, instead of creating a duplicate.`)
  }

  return { batchId: batch.id, recordCount: toCreate.length, warnings }
}

export async function importSubscriptionRows(rows: SubscriptionRow[], filename: string, period: string | null, warnings: string[] = []): Promise<ImportResult> {
  const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))
  await ensureBusinessUnits(normalizedRows.map((r) => r.businessUnit))

  const batch = await prisma.uploadBatch.create({
    data: { type: 'subscription', filename, recordCount: normalizedRows.length, period: period || null },
  })
  await prisma.subscriptionRecord.createMany({
    data: normalizedRows.map((r) => ({
      month: r.month || null,
      staffId: r.staffId.toUpperCase(),
      staffName: r.staffName,
      email: r.email || null,
      category: r.category || 'membership',
      businessUnit: r.businessUnit,
      membershipOrg: r.membershipOrg,
      amount: r.amount,
      batchId: batch.id,
    })),
  })
  return { batchId: batch.id, recordCount: normalizedRows.length, warnings }
}

export async function importKSSRows(rows: KSSRow[], filename: string, period: string | null, warnings: string[] = []): Promise<ImportResult> {
  const year = period ? parseInt(period.split('-')[0]) : new Date().getFullYear()
  const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))
  await ensureBusinessUnits(normalizedRows.map((r) => r.businessUnit))

  const batch = await prisma.uploadBatch.create({
    data: { type: 'kss', filename, recordCount: normalizedRows.length, period: period || null },
  })
  await prisma.kSSRecord.createMany({
    data: normalizedRows.map((r) => ({
      staffId: r.staffId.toUpperCase(),
      staffName: r.staffName,
      email: r.email || null,
      businessUnit: r.businessUnit,
      durationMinutes: r.durationMinutes,
      month: r.month || null,
      year,
      batchId: batch.id,
    })),
  })
  return { batchId: batch.id, recordCount: normalizedRows.length, warnings }
}

// Roster is a snapshot, not an event log — every row here is `rows` filtered by the caller down
// to genuinely new-or-changed people (see dedupeRoster in sheets-sync.ts), never the full sheet
// re-imported wholesale, so this doesn't bloat StaffRosterRecord with an unchanged copy of
// everyone on every sync run.
export async function importRosterRows(rows: RosterRow[], filename: string, period: string | null, warnings: string[] = []): Promise<ImportResult> {
  const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))
  await ensureBusinessUnits(normalizedRows.map((r) => r.businessUnit))

  const batch = await prisma.uploadBatch.create({
    data: { type: 'roster', filename, recordCount: normalizedRows.length, period: period || null },
  })
  await prisma.staffRosterRecord.createMany({
    data: normalizedRows.map((r) => ({
      staffId: r.staffId.toUpperCase(),
      firstName: r.firstName,
      middleName: r.middleName || null,
      lastName: r.lastName,
      email: r.email || null,
      lineManagerStaffId: r.lineManagerStaffId || null,
      businessUnit: r.businessUnit,
      role: r.role || null,
      department: r.department || null,
      employmentDate: r.employmentDate ? new Date(r.employmentDate) : null,
      confirmed: r.confirmed,
      active: r.active,
      batchId: batch.id,
    })),
  })
  invalidateComprehensiveStaffListCache()
  return { batchId: batch.id, recordCount: normalizedRows.length, warnings }
}
