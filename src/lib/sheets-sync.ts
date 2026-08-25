import { prisma } from '@/lib/prisma'
import { connectToSpreadsheet, fetchSheetAsBuffer, batchUpdateRowsByCompoundKey, type SheetsConnection } from '@/lib/google-sheets'
import { parseTrainingExcel, parseFeedbackExcel, parseSubscriptionExcel, parseKSSExcel, parseRosterExcel } from '@/lib/excel-parser'
import type { TrainingRow, FeedbackRow, SubscriptionRow, KSSRow, RosterRow } from '@/lib/excel-parser'
import { importTrainingRows, importFeedbackRows, importSubscriptionRows, importKSSRows, importRosterRows } from '@/lib/import-records'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'

// Unlike manual file uploads (where re-uploading the same file twice is the admin's call), a
// live sheet is re-read on every sync, so it would otherwise re-import the same rows forever.
// Each function below drops rows that already have a matching record in the DB, keyed on the
// fields that identify "the same event" for that data type.
//
// Two normalization steps matter here: Business Unit names must be run through the same
// normalizeBUName() used at import time (a stored record has the canonical name, e.g. "Meristem
// Securities Limited", not the raw sheet text "MSL" — comparing raw-to-canonical never matches).
// Numeric fields derived from unit conversion (durationMinutes from HH:MM:SS) are rounded before
// comparing, since the same value can serialize with different floating-point noise
// (49.199999999999996 vs 49.2) depending on which tool wrote it.

function roundNum(n: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

async function dedupeTraining(rows: TrainingRow[]): Promise<TrainingRow[]> {
  const existing = await prisma.trainingRecord.findMany({ select: { staffId: true, training: true, cost: true } })
  const key = (staffId: string, training: string, cost: number) => `${normalizeStaffIdKey(staffId)}|${training.trim().toLowerCase()}|${roundNum(cost, 2)}`
  const seen = new Set(existing.map((r) => key(r.staffId, r.training, r.cost)))
  return rows.filter((r) => !seen.has(key(r.staffId, r.training, r.cost)))
}

export interface TrainingRecordSnapshot {
  staffId: string
  staffName: string
  businessUnit: string
  cost: number
  hours: number | null
  trainingType: string | null
  capability: string | null
  vendor: string | null
  month: string
}

const TRACKED_TRAINING_FIELDS: (keyof TrainingRecordSnapshot)[] = [
  'staffId', 'staffName', 'businessUnit', 'cost', 'hours', 'trainingType', 'capability', 'vendor', 'month',
]

function trainingLooseKey(staffName: string, training: string, month: string): string {
  return `${staffName.trim().toLowerCase()}|${training.trim().toLowerCase()}|${(month || '').trim().toLowerCase()}`
}

export interface TrainingRecordChangeCandidate {
  existingRecordId: string
  oldData: TrainingRecordSnapshot
  newData: TrainingRecordSnapshot
  changedFields: string[]
}

// Splits incoming sheet rows into genuinely new rows (import directly, same as before) and
// probable edits to an already-imported row (staged for review rather than silently applied,
// since the match is by name+training+month — Staff ID itself is excluded from the match key
// precisely because it's sometimes the field being corrected — and could occasionally be a false
// positive, e.g. two different people with the same name in the same training).
//
// Every row that matches an existing one this way is compared field-by-field across ALL tracked
// fields (not just staffId/training/cost) — a row is only "genuinely unchanged" if nothing in it
// differs; otherwise it's a change candidate, even if only e.g. vendor differs. An earlier version
// short-circuited on a staffId+training+cost match before ever comparing the rest, which meant a
// vendor-only edit in the sheet (or any field not in that narrower identity) was silently ignored
// as "already imported" and never reached review.
async function reconcileTraining(
  rows: TrainingRow[],
  year: number
): Promise<{ newRows: TrainingRow[]; changes: TrainingRecordChangeCandidate[] }> {
  const existing = await prisma.trainingRecord.findMany({ where: { year } })

  const looseMap = new Map<string, (typeof existing)[number]>()
  for (const r of existing) {
    const k = trainingLooseKey(r.staffName, r.training, r.month)
    if (!looseMap.has(k)) looseMap.set(k, r) // first wins — ambiguous duplicates aren't worth resolving here
  }

  const newRows: TrainingRow[] = []
  const changes: TrainingRecordChangeCandidate[] = []
  const claimed = new Set<string>()

  for (const row of rows) {
    const match = looseMap.get(trainingLooseKey(row.staffName, row.training, row.month))
    if (match && !claimed.has(match.id)) {
      claimed.add(match.id)
      const oldData: TrainingRecordSnapshot = {
        staffId: match.staffId, staffName: match.staffName, businessUnit: match.businessUnit,
        cost: match.cost, hours: match.hours, trainingType: match.trainingType, capability: match.capability,
        vendor: match.vendor, month: match.month,
      }
      const newData: TrainingRecordSnapshot = {
        staffId: row.staffId, staffName: row.staffName, businessUnit: normalizeBUName(row.businessUnit),
        cost: row.cost, hours: row.hours || null, trainingType: row.trainingType || null, capability: row.capability || null,
        vendor: row.vendor || null, month: row.month,
      }
      const changedFields = TRACKED_TRAINING_FIELDS.filter((f) => String(oldData[f] ?? '') !== String(newData[f] ?? ''))
      if (changedFields.length > 0) {
        changes.push({ existingRecordId: match.id, oldData, newData, changedFields })
      }
      continue
    }

    newRows.push(row) // no match at all — a genuinely new row
  }

  return { newRows, changes }
}

// Applies one accepted TrainingRecordChange. If the Staff ID itself was corrected, that's
// propagated to every other TrainingRecord/SubscriptionRecord/KSSRecord still filed under the old
// ID — not just the one flagged row — since the same malformed ID (e.g. a full company name
// instead of its short code) tends to appear on every record for that person, not only the one
// that happened to get re-synced and flagged.
export async function applyTrainingRecordChange(change: { existingRecordId: string; newData: string; oldData: string }) {
  const newData = JSON.parse(change.newData) as TrainingRecordSnapshot
  const oldData = JSON.parse(change.oldData) as TrainingRecordSnapshot

  if (oldData.staffId !== newData.staffId) {
    await Promise.all([
      prisma.trainingRecord.updateMany({ where: { staffId: oldData.staffId }, data: { staffId: newData.staffId } }),
      prisma.subscriptionRecord.updateMany({ where: { staffId: oldData.staffId }, data: { staffId: newData.staffId } }),
      prisma.kSSRecord.updateMany({ where: { staffId: oldData.staffId }, data: { staffId: newData.staffId } }),
    ])
  }

  await prisma.trainingRecord.update({ where: { id: change.existingRecordId }, data: newData })
}

// Bulk "Accept All" for a potentially large pending list, redesigned around one constraint: a
// single server call must never be able to time out, full stop — not "less likely to", never.
// Earlier versions tried to process everything (or large batches of it) in one request; even with
// per-row error isolation, an up-front phase (propagating every unique Staff ID correction before
// touching any individual row) could itself run long with enough distinct corrections, and because
// nothing was saved until that phase finished, a slow run still meant zero visible progress.
//
// This version processes exactly one small, fully self-contained chunk per call — propagation for
// just that chunk's IDs, the chunk's own record updates, and the chunk's proposals deleted —
// so every single call is fast and its result is permanently saved before the call returns. The
// caller (the admin panel) loops this automatically: click once, it keeps calling until nothing's
// left, and if the browser is closed partway through, whatever chunks already ran stay applied —
// reopening the panel shows the true remaining count, and clicking again picks up from there.
const CHUNK_SIZE = 10

export interface ApplyChunkResult {
  appliedThisChunk: number
  orphanedThisChunk: number
  remaining: number
  total: number
  failed: { id: string; message: string }[]
}

export async function applyNextTrainingRecordChangeChunk(): Promise<ApplyChunkResult> {
  const total = await prisma.trainingRecordChange.count()
  const chunk = await prisma.trainingRecordChange.findMany({ take: CHUNK_SIZE, orderBy: { detectedAt: 'asc' } })

  if (chunk.length === 0) {
    return { appliedThisChunk: 0, orphanedThisChunk: 0, remaining: 0, total, failed: [] }
  }

  const parsed = chunk.map((c) => ({
    id: c.id,
    existingRecordId: c.existingRecordId,
    oldData: JSON.parse(c.oldData) as TrainingRecordSnapshot,
    newData: JSON.parse(c.newData) as TrainingRecordSnapshot,
  }))

  const idPairs = new Map<string, string>()
  for (const c of parsed) {
    if (c.oldData.staffId !== c.newData.staffId) idPairs.set(c.oldData.staffId, c.newData.staffId)
  }
  for (const [oldId, newId] of idPairs) {
    try {
      await Promise.all([
        prisma.trainingRecord.updateMany({ where: { staffId: oldId }, data: { staffId: newId } }),
        prisma.subscriptionRecord.updateMany({ where: { staffId: oldId }, data: { staffId: newId } }),
        prisma.kSSRecord.updateMany({ where: { staffId: oldId }, data: { staffId: newId } }),
      ])
    } catch (err) {
      console.error('[applyNextTrainingRecordChangeChunk] ID propagation failed', oldId, '->', newId, err)
    }
  }

  const results = await Promise.allSettled(
    parsed.map((c) => prisma.trainingRecord.update({ where: { id: c.existingRecordId }, data: c.newData }))
  )

  let appliedThisChunk = 0
  let orphanedThisChunk = 0
  const failed: { id: string; message: string }[] = []
  const toDelete: string[] = []

  results.forEach((result, idx) => {
    const c = parsed[idx]
    if (result.status === 'fulfilled') {
      toDelete.push(c.id)
      appliedThisChunk++
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
      if (message.includes('Record to update not found') || message.includes('P2025')) {
        toDelete.push(c.id)
        orphanedThisChunk++
      } else {
        failed.push({ id: c.id, message })
      }
    }
  })

  if (toDelete.length > 0) {
    await prisma.trainingRecordChange.deleteMany({ where: { id: { in: toDelete } } })
  }

  return { appliedThisChunk, orphanedThisChunk, remaining: total - toDelete.length, total, failed }
}

async function dedupeFeedback(rows: FeedbackRow[]): Promise<FeedbackRow[]> {
  // FeedbackRecord has no staffId field — the closest available fingerprint for "same response".
  const existing = await prisma.feedbackRecord.findMany({
    select: { businessUnit: true, trainingTitle: true, month: true, confidenceRating: true },
  })
  const key = (bu: string, title: string, month: string | null, rating: number | null) =>
    `${normalizeBUName(bu).toLowerCase()}|${title.trim().toLowerCase()}|${month || ''}|${rating && rating > 0 ? rating : ''}`
  const seen = new Set(existing.map((r) => key(r.businessUnit, r.trainingTitle, r.month, r.confidenceRating)))
  return rows.filter((r) => !seen.has(key(r.businessUnit, r.trainingTitle, r.month, r.confidenceRating)))
}

async function dedupeSubscription(rows: SubscriptionRow[]): Promise<SubscriptionRow[]> {
  const existing = await prisma.subscriptionRecord.findMany({ select: { staffId: true, membershipOrg: true, amount: true } })
  const key = (staffId: string, org: string, amount: number) => `${normalizeStaffIdKey(staffId)}|${org.trim().toLowerCase()}|${roundNum(amount, 2)}`
  const seen = new Set(existing.map((r) => key(r.staffId, r.membershipOrg, r.amount)))
  return rows.filter((r) => !seen.has(key(r.staffId, r.membershipOrg, r.amount)))
}

async function dedupeKSS(rows: KSSRow[]): Promise<KSSRow[]> {
  const existing = await prisma.kSSRecord.findMany({ select: { staffId: true, durationMinutes: true, month: true } })
  const key = (staffId: string, duration: number, month: string | null) => `${normalizeStaffIdKey(staffId)}|${roundNum(duration, 1)}|${month || ''}`
  const seen = new Set(existing.map((r) => key(r.staffId, r.durationMinutes, r.month)))
  return rows.filter((r) => !seen.has(key(r.staffId, r.durationMinutes, r.month)))
}

// Roster's fields, folded into one comparable string — used to tell "this person's row hasn't
// actually changed" apart from "something changed and a new snapshot row is needed".
function rosterFingerprint(r: {
  firstName: string; middleName: string | null; lastName: string; email: string | null
  lineManagerStaffId: string | null; businessUnit: string; role: string | null; department: string | null
  employmentDate: Date | null; confirmed: boolean
}): string {
  return [
    r.firstName.trim().toLowerCase(),
    (r.middleName || '').trim().toLowerCase(),
    r.lastName.trim().toLowerCase(),
    (r.email || '').trim().toLowerCase(),
    (r.lineManagerStaffId || '').trim().toUpperCase(),
    r.businessUnit,
    (r.role || '').trim().toLowerCase(),
    (r.department || '').trim().toLowerCase(),
    r.employmentDate ? r.employmentDate.toISOString().slice(0, 10) : '',
    String(r.confirmed),
  ].join('|')
}

// Roster is a snapshot (see importRosterRows), not an event log like the other 4 sync types —
// importing every row on every sync would create a redundant new StaffRosterRecord for everyone
// on staff, every single day, even when nothing changed. Instead: only rows that are brand new
// (Staff ID never seen before) or that differ from that Staff ID's current (most recent) record
// get imported; everyone else is skipped, same "only act on what actually changed" spirit as
// reconcileTraining, just without a review step — Staff ID is a reliable enough match key here
// (unlike Training's name-based loose match) that overwriting via a new snapshot row is safe.
async function dedupeRoster(rows: RosterRow[]): Promise<RosterRow[]> {
  const all = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })
  const latestByStaffId = new Map<string, (typeof all)[number]>()
  for (const r of all) latestByStaffId.set(normalizeStaffIdKey(r.staffId), r)

  return rows.filter((row) => {
    const existing = latestByStaffId.get(normalizeStaffIdKey(row.staffId))
    if (!existing) return true
    const incoming = rosterFingerprint({
      firstName: row.firstName, middleName: row.middleName || null, lastName: row.lastName,
      email: row.email || null, lineManagerStaffId: row.lineManagerStaffId || null,
      businessUnit: normalizeBUName(row.businessUnit),
      role: row.role || null, department: row.department || null,
      employmentDate: row.employmentDate ? new Date(row.employmentDate) : null,
      confirmed: row.confirmed,
    })
    return incoming !== rosterFingerprint(existing)
  })
}

type JobType = 'training' | 'feedback' | 'subscription' | 'kss' | 'roster'
interface Job { type: JobType; sheetName: string; label: string }

function jobsFor(config: {
  trainingSheetName: string; feedbackSheetName: string; subscriptionSheetName: string; kssSheetName: string
  rosterSheetName?: string | null
}): Job[] {
  const jobs: Job[] = [
    { type: 'training', sheetName: config.trainingSheetName, label: 'Training Cost' },
    { type: 'feedback', sheetName: config.feedbackSheetName, label: 'Feedback' },
    { type: 'subscription', sheetName: config.subscriptionSheetName, label: 'Subscriptions' },
    { type: 'kss', sheetName: config.kssSheetName, label: 'KSS' },
  ]
  // Roster is opt-in (no default tab name) — omitted entirely from the job list rather than
  // shown as a permanent "No tab name configured" error for admins who manage it by upload only.
  if (config.rosterSheetName?.trim()) {
    jobs.push({ type: 'roster', sheetName: config.rosterSheetName, label: 'Staff Roster' })
  }
  return jobs
}

async function connectOrThrow(spreadsheetUrl: string | null): Promise<SheetsConnection> {
  if (!spreadsheetUrl) throw new Error('No Google Sheet configured yet.')
  return connectToSpreadsheet(spreadsheetUrl)
}

function trainingSample(rows: TrainingRow[]) {
  return rows.slice(0, 5).map((r) => ({ Name: r.staffName, Training: r.training, 'Business Unit': r.businessUnit, Month: r.month, Cost: r.cost }))
}
function feedbackSample(rows: FeedbackRow[]) {
  return rows.slice(0, 5).map((r) => ({ 'Business Unit': r.businessUnit, 'Training Title': r.trainingTitle, Month: r.month, Rating: r.confidenceRating || '—' }))
}
function subscriptionSample(rows: SubscriptionRow[]) {
  return rows.slice(0, 5).map((r) => ({ Name: r.staffName, 'Business Unit': r.businessUnit, Organization: r.membershipOrg, Amount: r.amount }))
}
function kssSample(rows: KSSRow[]) {
  return rows.slice(0, 5).map((r) => ({ Name: r.staffName, 'Business Unit': r.businessUnit, 'Duration (min)': r.durationMinutes, Month: r.month }))
}
function rosterSample(rows: RosterRow[]) {
  return rows.slice(0, 5).map((r) => ({ Name: `${r.firstName} ${r.lastName}`.trim(), 'Staff ID': r.staffId, 'Business Unit': r.businessUnit, Role: r.role || '—' }))
}

export interface SheetPreview {
  type: JobType
  label: string
  sheetName: string
  totalRows: number
  newRows: number
  alreadyImported: number
  sample: Record<string, string | number>[]
  error?: string
}

export interface SyncPreviewResult {
  success: boolean
  connectionError?: string
  spreadsheetTitle?: string
  sheets: SheetPreview[]
}

// Read-only — fetches, parses, and de-dupes each tab, but never writes to the database. Powers
// the "Preview" step so the admin can see exactly what would be imported before confirming.
export async function previewGoogleSheetsSync(): Promise<SyncPreviewResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  let connection: SheetsConnection
  try {
    connection = await connectOrThrow(config?.spreadsheetUrl ?? null)
  } catch (err) {
    return { success: false, connectionError: err instanceof Error ? err.message : 'Failed to connect to Google Sheets.', sheets: [] }
  }

  const sheets: SheetPreview[] = []

  for (const job of jobsFor(config!)) {
    const base = { type: job.type, label: job.label, sheetName: job.sheetName || '' }
    if (!job.sheetName?.trim()) {
      sheets.push({ ...base, totalRows: 0, newRows: 0, alreadyImported: 0, sample: [], error: 'No tab name configured.' })
      continue
    }
    if (!connection.tabTitles.includes(job.sheetName.trim())) {
      sheets.push({ ...base, totalRows: 0, newRows: 0, alreadyImported: 0, sample: [], error: `Tab "${job.sheetName}" not found in the spreadsheet.` })
      continue
    }
    try {
      const buffer = await fetchSheetAsBuffer(connection.spreadsheetId, job.sheetName.trim(), connection.accessToken)

      if (job.type === 'training') {
        const { rows, errors } = parseTrainingExcel(buffer)
        if (errors.length) { sheets.push({ ...base, totalRows: 0, newRows: 0, alreadyImported: 0, sample: [], error: errors.join(' ') }); continue }
        const newRows = await dedupeTraining(rows)
        sheets.push({ ...base, totalRows: rows.length, newRows: newRows.length, alreadyImported: rows.length - newRows.length, sample: trainingSample(newRows) })
      } else if (job.type === 'feedback') {
        const { rows, errors } = parseFeedbackExcel(buffer)
        if (errors.length) { sheets.push({ ...base, totalRows: 0, newRows: 0, alreadyImported: 0, sample: [], error: errors.join(' ') }); continue }
        const newRows = await dedupeFeedback(rows)
        sheets.push({ ...base, totalRows: rows.length, newRows: newRows.length, alreadyImported: rows.length - newRows.length, sample: feedbackSample(newRows) })
      } else if (job.type === 'subscription') {
        const { rows, errors } = parseSubscriptionExcel(buffer)
        if (errors.length) { sheets.push({ ...base, totalRows: 0, newRows: 0, alreadyImported: 0, sample: [], error: errors.join(' ') }); continue }
        const newRows = await dedupeSubscription(rows)
        sheets.push({ ...base, totalRows: rows.length, newRows: newRows.length, alreadyImported: rows.length - newRows.length, sample: subscriptionSample(newRows) })
      } else if (job.type === 'kss') {
        const { rows, errors } = parseKSSExcel(buffer)
        if (errors.length) { sheets.push({ ...base, totalRows: 0, newRows: 0, alreadyImported: 0, sample: [], error: errors.join(' ') }); continue }
        const newRows = await dedupeKSS(rows)
        sheets.push({ ...base, totalRows: rows.length, newRows: newRows.length, alreadyImported: rows.length - newRows.length, sample: kssSample(newRows) })
      } else if (job.type === 'roster') {
        const { rows, errors } = parseRosterExcel(buffer)
        if (errors.length) { sheets.push({ ...base, totalRows: 0, newRows: 0, alreadyImported: 0, sample: [], error: errors.join(' ') }); continue }
        const newRows = await dedupeRoster(rows)
        sheets.push({ ...base, totalRows: rows.length, newRows: newRows.length, alreadyImported: rows.length - newRows.length, sample: rosterSample(newRows) })
      }
    } catch (err) {
      sheets.push({ ...base, totalRows: 0, newRows: 0, alreadyImported: 0, sample: [], error: err instanceof Error ? err.message : 'Failed to read this tab.' })
    }
  }

  return { success: sheets.every((s) => !s.error), spreadsheetTitle: connection.spreadsheetTitle, sheets }
}

export interface SyncResult {
  success: boolean
  imported: Record<string, number>
  errors: { sheet: string; message: string }[]
  changesDetected: number
}

// Writes to the database — call after the admin has reviewed previewGoogleSheetsSync()'s output
// and confirmed. Re-fetches and re-dedupes at commit time (rather than trusting the preview's
// snapshot) so a stale preview can never double-import if the sheet changed in between.
export async function syncFromGoogleSheets(trigger: 'manual' | 'scheduled' = 'manual'): Promise<SyncResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl) {
    return { success: false, imported: {}, errors: [{ sheet: 'Connection', message: 'No Google Sheet configured yet.' }], changesDetected: 0 }
  }

  const errors: { sheet: string; message: string }[] = []
  const imported: Record<string, number> = {}
  const batchIds: string[] = []
  let changesDetected = 0

  let connection: SheetsConnection
  try {
    connection = await connectToSpreadsheet(config.spreadsheetUrl)
  } catch (err) {
    return {
      success: false,
      imported: {},
      errors: [{ sheet: 'Connection', message: err instanceof Error ? err.message : 'Failed to connect to Google Sheets.' }],
      changesDetected: 0,
    }
  }

  const filenamePrefix = `Google Sheets — ${connection.spreadsheetTitle}`
  const today = new Date().toISOString().slice(0, 10)

  for (const job of jobsFor(config)) {
    if (!job.sheetName?.trim()) {
      errors.push({ sheet: job.label, message: 'No tab name configured.' })
      continue
    }
    if (!connection.tabTitles.includes(job.sheetName.trim())) {
      errors.push({ sheet: job.label, message: `Tab "${job.sheetName}" not found in the spreadsheet.` })
      continue
    }

    try {
      const buffer = await fetchSheetAsBuffer(connection.spreadsheetId, job.sheetName.trim(), connection.accessToken)
      const filename = `${filenamePrefix} — ${job.label} — ${today}`

      if (job.type === 'training') {
        const { rows, errors: parseErrors, warnings } = parseTrainingExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }

        const year = new Date().getFullYear()
        const { newRows, changes } = await reconcileTraining(rows, year)

        // Refresh, not append — re-detecting the same edit on a later sync should update the
        // proposal (or clear it if it's since resolved), not pile up duplicate proposals.
        await prisma.trainingRecordChange.deleteMany({ where: { existingRecordId: { in: changes.map((c) => c.existingRecordId) } } })
        if (changes.length > 0) {
          await prisma.trainingRecordChange.createMany({
            data: changes.map((c) => ({
              existingRecordId: c.existingRecordId,
              oldData: JSON.stringify(c.oldData),
              newData: JSON.stringify(c.newData),
              changedFields: JSON.stringify(c.changedFields),
            })),
          })
        }
        changesDetected += changes.length

        if (newRows.length === 0) { imported.training = 0; continue }
        const result = await importTrainingRows(newRows, filename, null, warnings)
        imported.training = result.recordCount
        batchIds.push(result.batchId)
      } else if (job.type === 'feedback') {
        const { rows, errors: parseErrors, warnings } = parseFeedbackExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const newRows = await dedupeFeedback(rows)
        if (newRows.length === 0) { imported.feedback = 0; continue }
        const result = await importFeedbackRows(newRows, filename, null, warnings)
        imported.feedback = result.recordCount
        batchIds.push(result.batchId)
      } else if (job.type === 'subscription') {
        const { rows, errors: parseErrors, warnings } = parseSubscriptionExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const newRows = await dedupeSubscription(rows)
        if (newRows.length === 0) { imported.subscription = 0; continue }
        const result = await importSubscriptionRows(newRows, filename, null, warnings)
        imported.subscription = result.recordCount
        batchIds.push(result.batchId)
      } else if (job.type === 'kss') {
        const { rows, errors: parseErrors, warnings } = parseKSSExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const newRows = await dedupeKSS(rows)
        if (newRows.length === 0) { imported.kss = 0; continue }
        const result = await importKSSRows(newRows, filename, null, warnings)
        imported.kss = result.recordCount
        batchIds.push(result.batchId)
      } else if (job.type === 'roster') {
        const { rows, errors: parseErrors, warnings } = parseRosterExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const newRows = await dedupeRoster(rows)
        if (newRows.length === 0) { imported.roster = 0; continue }
        const result = await importRosterRows(newRows, filename, null, warnings)
        imported.roster = result.recordCount
        batchIds.push(result.batchId)
      }
    } catch (err) {
      errors.push({ sheet: job.label, message: err instanceof Error ? err.message : 'Sync failed for this tab.' })
    }
  }

  const success = errors.length === 0

  await prisma.googleSheetsConfig.update({
    where: { id: config.id },
    data: {
      lastSyncedAt: new Date(),
      lastSyncStatus: success ? 'success' : 'error',
      lastSyncErrors: JSON.stringify(errors),
    },
  })

  await prisma.googleSheetsSyncLog.create({
    data: {
      trigger,
      success,
      imported: JSON.stringify(imported),
      errors: JSON.stringify(errors),
      batchIds: JSON.stringify(batchIds),
    },
  })

  // Keep only the 5 most recent runs — this only prunes the log/undo trail, never the imported
  // records themselves (those stay in Upload History regardless of how old the sync log is).
  const staleLogEntries = await prisma.googleSheetsSyncLog.findMany({
    orderBy: { syncedAt: 'desc' },
    skip: 5,
    select: { id: true },
  })
  if (staleLogEntries.length > 0) {
    await prisma.googleSheetsSyncLog.deleteMany({ where: { id: { in: staleLogEntries.map((e) => e.id) } } })
  }

  return { success, imported, errors, changesDetected }
}

export interface PushVendorResult {
  success: boolean
  updated: number
  notFound: number
  year: number
  error?: string
}

// Vendor is often fixed on the platform (Manage Records, Data Quality Audit fixes, Talent
// Members) after a row was already imported, or fixed retroactively straight in the sheet for
// old rows the admin is backfilling by hand. Either way the OTHER side can end up stale. This
// pushes the platform's current vendor values for every TrainingRecord that has one back into the
// live sheet's Vendor column, matched by the same loose key (Name + Training + Month) reconcile
// uses — Staff ID can't be the key here since it's sometimes the very field being corrected.
// Scoped to one year at a time (defaulting to the current year) since the configured sheet tab is
// itself one year's data (e.g. "2026 Training Data") — pushing a prior year's fixes needs that
// year explicitly requested, not assumed.
export async function pushVendorUpdatesToSheet(year: number = new Date().getFullYear()): Promise<PushVendorResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl) {
    return { success: false, updated: 0, notFound: 0, year, error: 'No Google Sheet configured yet.' }
  }
  if (!config.trainingSheetName?.trim()) {
    return { success: false, updated: 0, notFound: 0, year, error: 'No Training Cost tab name configured.' }
  }

  let connection: SheetsConnection
  try {
    connection = await connectToSpreadsheet(config.spreadsheetUrl)
  } catch (err) {
    return { success: false, updated: 0, notFound: 0, year, error: err instanceof Error ? err.message : 'Failed to connect to Google Sheets.' }
  }

  const sheetName = config.trainingSheetName.trim()
  if (!connection.tabTitles.includes(sheetName)) {
    return { success: false, updated: 0, notFound: 0, year, error: `Tab "${sheetName}" not found in the spreadsheet.` }
  }

  // Excludes '' as well as null — a vendor that was cleared back to blank on the platform
  // shouldn't overwrite a value that's still genuinely present in the sheet; only a real vendor
  // value gets pushed.
  const records = await prisma.trainingRecord.findMany({
    where: { year, vendor: { not: null }, NOT: { vendor: '' } },
    select: { staffId: true, staffName: true, training: true, month: true, vendor: true },
  })
  if (records.length === 0) {
    return { success: true, updated: 0, notFound: 0, year }
  }

  // Staff ID is the key here (not staffName, unlike reconcileTraining's loose key) — vendor
  // fixes never touch Staff ID, so it's trustworthy, and it's far less collision-prone than a
  // full-name match (no risk of two different "Name" formats between the DB and the sheet).
  try {
    const { found, notFound, error } = await batchUpdateRowsByCompoundKey(
      connection.spreadsheetId,
      sheetName,
      connection.accessToken,
      [
        ['staffid', 'staffno', 'employeeid', 'employeeno', 'id'],
        ['training', 'trainingname', 'trainingtitle', 'course', 'programme'],
        ['month', 'period', 'trainingmonth'],
      ],
      records.map((r) => ({
        keyParts: [r.staffId, r.training, r.month],
        updates: [{ columnCandidates: ['vendor', 'trainingvendor', 'provider', 'facilitator', 'trainer'], value: r.vendor || '' }],
      }))
    )
    return { success: !error, updated: found, notFound, year, error }
  } catch (err) {
    return { success: false, updated: 0, notFound: 0, year, error: err instanceof Error ? err.message : 'Failed to write to the sheet.' }
  }
}

export interface RosterBackfillResult {
  checked: number // flagged staff (missing at least one of the fields below) that were looked up
  updated: number // of those, how many had at least one field actually filled in
  fieldsFilled: number // total individual field values filled in, across all updated staff
  stillMissing: number // checked but the sheet had nothing to fill them with either
  noSheetRow: number // of stillMissing, how many had no row in the sheet by Staff ID OR by exact name
  ambiguousName: number // of stillMissing, how many had NO Staff ID match but 2+ same-named rows in the sheet — too risky to guess which is them, likely a leftover duplicate row in the sheet itself
  matchedByName: number // Staff ID lookup failed, but an unambiguous exact-name match in the sheet was used instead
  staffIdMismatch: number // of matchedByName, how many also have a DIFFERENT Staff ID in the sheet than what's stored here — a real ID correction opportunity, reported but never auto-applied
  fieldBreakdown: { field: string; missingInDb: number; availableInSheet: number }[]
  error?: string
}

// Fills gaps ONLY — never overwrites a value that's already present, and never invents one. Pulls
// exclusively from the sheet tab already configured for staff sync (Staff Roster tab, falling back
// to the Comprehensive Staff List tab if that's what's set instead) — this is a read from a source
// the admin explicitly configured, not a guess. A person still missing a field after this ran
// genuinely has no value for it in that sheet either.
export async function backfillRosterFromSheet(): Promise<RosterBackfillResult> {
  const empty = { checked: 0, updated: 0, fieldsFilled: 0, stillMissing: 0, noSheetRow: 0, ambiguousName: 0, matchedByName: 0, staffIdMismatch: 0, fieldBreakdown: [] }
  const config = await prisma.googleSheetsConfig.findFirst()
  const sheetName = (config?.rosterSheetName || config?.comprehensiveStaffListSheetName || '').trim()
  if (!sheetName || !config?.spreadsheetUrl) {
    return { ...empty, error: 'No Staff Roster or Comprehensive Staff List tab configured under Admin -> Live Data Source.' }
  }

  let connection: SheetsConnection
  try {
    connection = await connectToSpreadsheet(config.spreadsheetUrl)
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : 'Failed to connect to Google Sheets.' }
  }
  if (!connection.tabTitles.includes(sheetName)) {
    return { ...empty, error: `Tab "${sheetName}" not found in the spreadsheet.` }
  }

  let sheetRows: RosterRow[]
  try {
    const buffer = await fetchSheetAsBuffer(connection.spreadsheetId, sheetName, connection.accessToken)
    const { rows, errors } = parseRosterExcel(buffer)
    if (errors.length) return { ...empty, error: errors.join(' ') }
    sheetRows = rows
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : 'Failed to read this tab.' }
  }

  const sheetByStaffId = new Map<string, RosterRow>()
  const sheetByName = new Map<string, RosterRow[]>()
  for (const r of sheetRows) {
    const idKey = normalizeStaffIdKey(r.staffId)
    if (idKey) sheetByStaffId.set(idKey, r)
    const nameKey = `${r.firstName} ${r.lastName}`.trim().toLowerCase()
    if (nameKey) {
      if (!sheetByName.has(nameKey)) sheetByName.set(nameKey, [])
      sheetByName.get(nameKey)!.push(r)
    }
  }

  // Same "latest row per Staff ID" convention as everywhere else this table is read — only the
  // CURRENT record per person is a backfill target, not their superseded history.
  const all = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })
  const latestByStaffId = new Map<string, (typeof all)[number]>()
  for (const r of all) latestByStaffId.set(normalizeStaffIdKey(r.staffId), r)

  let checked = 0, fieldsFilled = 0, stillMissing = 0, noSheetRow = 0, ambiguousName = 0, matchedByName = 0, staffIdMismatch = 0
  const fieldStats: Record<string, { missingInDb: number; availableInSheet: number }> = {
    email: { missingInDb: 0, availableInSheet: 0 },
    lineManagerStaffId: { missingInDb: 0, availableInSheet: 0 },
    role: { missingInDb: 0, availableInSheet: 0 },
    department: { missingInDb: 0, availableInSheet: 0 },
    employmentDate: { missingInDb: 0, availableInSheet: 0 },
  }
  const updates: { id: string; data: Record<string, unknown> }[] = []

  for (const [key, current] of latestByStaffId) {
    // A line manager pointed at yourself is never legitimate data (nobody reports to themselves)
    // — treat it exactly like a blank for backfill purposes, same as an actually-empty field,
    // rather than skipping it as "already has a value."
    const managerIsSelf = !!current.lineManagerStaffId && normalizeStaffIdKey(current.lineManagerStaffId) === key
    const missingAny = !current.email || !current.lineManagerStaffId || managerIsSelf || !current.role || !current.department || !current.employmentDate
    if (!missingAny) continue
    checked++

    // A Staff ID lookup can miss someone whose ID was corrected between the roster's last upload
    // and the sheet's current version — fall back to an exact name match, but ONLY when it's
    // unambiguous (exactly one person in the sheet with that name). Never touches the stored
    // Staff ID itself, even when this reveals it now differs from the sheet's — that's a real ID
    // correction, but a separate, deliberate action, not something to auto-apply here.
    let sheetRow = sheetByStaffId.get(key)
    let ambiguous = false
    if (!sheetRow) {
      const nameKey = `${current.firstName} ${current.lastName}`.trim().toLowerCase()
      const candidates = nameKey ? sheetByName.get(nameKey) || [] : []
      if (candidates.length === 1) {
        sheetRow = candidates[0]
        matchedByName++
        if (normalizeStaffIdKey(sheetRow.staffId) !== key) staffIdMismatch++
      } else if (candidates.length > 1) {
        ambiguous = true
      }
    }
    if (!sheetRow) {
      stillMissing++
      if (ambiguous) ambiguousName++
      else noSheetRow++
      continue
    }

    const data: Record<string, unknown> = {}
    if (!current.email) { fieldStats.email.missingInDb++; if (sheetRow.email) { data.email = sheetRow.email; fieldStats.email.availableInSheet++ } }
    if (!current.lineManagerStaffId || managerIsSelf) {
      fieldStats.lineManagerStaffId.missingInDb++
      // Only accept the sheet's manager if it's a real, different person — a sheet that ALSO has
      // them self-referencing has nothing usable to offer here either.
      if (sheetRow.lineManagerStaffId && normalizeStaffIdKey(sheetRow.lineManagerStaffId) !== key) {
        data.lineManagerStaffId = sheetRow.lineManagerStaffId
        fieldStats.lineManagerStaffId.availableInSheet++
      }
    }
    if (!current.role) { fieldStats.role.missingInDb++; if (sheetRow.role) { data.role = sheetRow.role; fieldStats.role.availableInSheet++ } }
    if (!current.department) { fieldStats.department.missingInDb++; if (sheetRow.department) { data.department = sheetRow.department; fieldStats.department.availableInSheet++ } }
    if (!current.employmentDate) { fieldStats.employmentDate.missingInDb++; if (sheetRow.employmentDate) { data.employmentDate = new Date(sheetRow.employmentDate); fieldStats.employmentDate.availableInSheet++ } }

    if (Object.keys(data).length === 0) { stillMissing++; continue }
    fieldsFilled += Object.keys(data).length
    updates.push({ id: current.id, data })
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates.map((u) => prisma.staffRosterRecord.update({ where: { id: u.id }, data: u.data })))
    invalidateComprehensiveStaffListCache()
  }

  const fieldBreakdown = Object.entries(fieldStats).map(([field, s]) => ({ field, ...s }))
  return { checked, updated: updates.length, fieldsFilled, stillMissing, noSheetRow, ambiguousName, matchedByName, staffIdMismatch, fieldBreakdown }
}

// Which Staff IDs are present in the live Staff Roster tab RIGHT NOW — used to tell a genuinely
// current record apart from a stale one when two different Staff IDs share the same name in
// StaffRosterRecord (see auditStaffQuality's duplicateNameGroups in staff-quality.ts). DB insertion order
// (createdAt) can't answer this: the roster only ever gets a NEW row for an ID it hasn't seen
// before (see importRosterRows), so a stale, long-abandoned ID can still have a newer createdAt
// than the ID the sheet was corrected back to. Returns null (never throws) on anything short of a
// clean read — no sheet configured, tab missing, connection failure — so callers can fall back to
// their existing best-guess heuristic instead of surfacing a hard error for what's a nice-to-have
// verification.
export async function getLiveRosterStaffIdKeys(): Promise<Set<string> | null> {
  try {
    const config = await prisma.googleSheetsConfig.findFirst()
    const sheetName = config?.rosterSheetName?.trim()
    if (!sheetName || !config?.spreadsheetUrl) return null

    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    if (!connection.tabTitles.includes(sheetName)) return null

    const buffer = await fetchSheetAsBuffer(connection.spreadsheetId, sheetName, connection.accessToken)
    const { rows, errors } = parseRosterExcel(buffer)
    if (errors.length) return null

    const keys = new Set<string>()
    for (const r of rows) {
      const key = normalizeStaffIdKey(r.staffId)
      if (key) keys.add(key)
    }
    return keys
  } catch {
    return null
  }
}
