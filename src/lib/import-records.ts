import { prisma } from '@/lib/prisma'
import { normalizeBUName } from '@/lib/bu-normalizer'
import type { TrainingRow, FeedbackRow, SubscriptionRow, KSSRow } from '@/lib/excel-parser'

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
      training: r.training,
      businessUnit: r.businessUnit,
      month: r.month,
      year,
      cost: r.cost,
      hours: r.hours > 0 ? r.hours : null,
      trainingType: r.trainingType || null,
      capability: r.capability || null,
      batchId: batch.id,
    })),
  })
  return { batchId: batch.id, recordCount: normalizedRows.length, warnings }
}

export async function importFeedbackRows(rows: FeedbackRow[], filename: string, period: string | null, warnings: string[] = []): Promise<ImportResult> {
  const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))
  await ensureBusinessUnits(normalizedRows.map((r) => r.businessUnit))

  const batch = await prisma.uploadBatch.create({
    data: { type: 'feedback', filename, recordCount: normalizedRows.length, period: period || null },
  })
  await prisma.feedbackRecord.createMany({
    data: normalizedRows.map((r) => ({
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
      batchId: batch.id,
    })),
  })
  return { batchId: batch.id, recordCount: normalizedRows.length, warnings }
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
      businessUnit: r.businessUnit,
      durationMinutes: r.durationMinutes,
      month: r.month || null,
      year,
      batchId: batch.id,
    })),
  })
  return { batchId: batch.id, recordCount: normalizedRows.length, warnings }
}
