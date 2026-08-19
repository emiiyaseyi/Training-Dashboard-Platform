import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { connectToSpreadsheet, type SheetsConnection } from '@/lib/google-sheets'
import { parseTrainingExcel, parseFeedbackExcel, parseSubscriptionExcel, parseKSSExcel } from '@/lib/excel-parser'
import type { TrainingRow, FeedbackRow, SubscriptionRow, KSSRow } from '@/lib/excel-parser'
import { importTrainingRows, importFeedbackRows, importSubscriptionRows, importKSSRows } from '@/lib/import-records'
import { normalizeBUName } from '@/lib/bu-normalizer'

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
  const key = (staffId: string, training: string, cost: number) => `${staffId.toUpperCase()}|${training.trim().toLowerCase()}|${roundNum(cost, 2)}`
  const seen = new Set(existing.map((r) => key(r.staffId, r.training, r.cost)))
  return rows.filter((r) => !seen.has(key(r.staffId, r.training, r.cost)))
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
  const key = (staffId: string, org: string, amount: number) => `${staffId.toUpperCase()}|${org.trim().toLowerCase()}|${roundNum(amount, 2)}`
  const seen = new Set(existing.map((r) => key(r.staffId, r.membershipOrg, r.amount)))
  return rows.filter((r) => !seen.has(key(r.staffId, r.membershipOrg, r.amount)))
}

async function dedupeKSS(rows: KSSRow[]): Promise<KSSRow[]> {
  const existing = await prisma.kSSRecord.findMany({ select: { staffId: true, durationMinutes: true, month: true } })
  const key = (staffId: string, duration: number, month: string | null) => `${staffId.toUpperCase()}|${roundNum(duration, 1)}|${month || ''}`
  const seen = new Set(existing.map((r) => key(r.staffId, r.durationMinutes, r.month)))
  return rows.filter((r) => !seen.has(key(r.staffId, r.durationMinutes, r.month)))
}

// Pulls the full contents of a tab and reassembles it as an XLSX buffer so it can go through
// the exact same parseXExcel() functions used for file uploads — the Sheets sync and the
// manual upload path can never drift apart in how they interpret columns.
async function fetchSheetAsBuffer(spreadsheetId: string, sheetName: string, accessToken: string): Promise<Buffer> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Could not read tab "${sheetName}" (${res.status}): ${body.slice(0, 150)}`)
  }
  const data = (await res.json()) as { values?: unknown[][] }
  const values = data.values || []
  const ws = XLSX.utils.aoa_to_sheet(values)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

type JobType = 'training' | 'feedback' | 'subscription' | 'kss'
interface Job { type: JobType; sheetName: string; label: string }

function jobsFor(config: { trainingSheetName: string; feedbackSheetName: string; subscriptionSheetName: string; kssSheetName: string }): Job[] {
  return [
    { type: 'training', sheetName: config.trainingSheetName, label: 'Training Cost' },
    { type: 'feedback', sheetName: config.feedbackSheetName, label: 'Feedback' },
    { type: 'subscription', sheetName: config.subscriptionSheetName, label: 'Subscriptions' },
    { type: 'kss', sheetName: config.kssSheetName, label: 'KSS' },
  ]
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
}

// Writes to the database — call after the admin has reviewed previewGoogleSheetsSync()'s output
// and confirmed. Re-fetches and re-dedupes at commit time (rather than trusting the preview's
// snapshot) so a stale preview can never double-import if the sheet changed in between.
export async function syncFromGoogleSheets(trigger: 'manual' | 'scheduled' = 'manual'): Promise<SyncResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl) {
    return { success: false, imported: {}, errors: [{ sheet: 'Connection', message: 'No Google Sheet configured yet.' }] }
  }

  const errors: { sheet: string; message: string }[] = []
  const imported: Record<string, number> = {}
  const batchIds: string[] = []

  let connection: SheetsConnection
  try {
    connection = await connectToSpreadsheet(config.spreadsheetUrl)
  } catch (err) {
    return {
      success: false,
      imported: {},
      errors: [{ sheet: 'Connection', message: err instanceof Error ? err.message : 'Failed to connect to Google Sheets.' }],
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
        const newRows = await dedupeTraining(rows)
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

  return { success, imported, errors }
}
