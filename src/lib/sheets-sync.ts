import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { connectToSpreadsheet } from '@/lib/google-sheets'
import { parseTrainingExcel, parseFeedbackExcel, parseSubscriptionExcel, parseKSSExcel } from '@/lib/excel-parser'
import type { TrainingRow, FeedbackRow, SubscriptionRow, KSSRow } from '@/lib/excel-parser'
import { importTrainingRows, importFeedbackRows, importSubscriptionRows, importKSSRows } from '@/lib/import-records'

// Unlike manual file uploads (where re-uploading the same file twice is the admin's call), a
// live sheet is re-read on every sync, so it would otherwise re-import the same rows forever.
// Each function below drops rows that already have a matching record in the DB, keyed on the
// fields that identify "the same event" for that data type.

async function dedupeTraining(rows: TrainingRow[]): Promise<TrainingRow[]> {
  const existing = await prisma.trainingRecord.findMany({ select: { staffId: true, training: true, cost: true } })
  const seen = new Set(existing.map((r) => `${r.staffId.toUpperCase()}|${r.training.trim().toLowerCase()}|${r.cost}`))
  return rows.filter((r) => !seen.has(`${r.staffId.toUpperCase()}|${r.training.trim().toLowerCase()}|${r.cost}`))
}

async function dedupeFeedback(rows: FeedbackRow[]): Promise<FeedbackRow[]> {
  // FeedbackRecord has no staffId field — the closest available fingerprint for "same response".
  const existing = await prisma.feedbackRecord.findMany({
    select: { businessUnit: true, trainingTitle: true, month: true, confidenceRating: true },
  })
  const seen = new Set(
    existing.map((r) => `${r.businessUnit.trim().toLowerCase()}|${r.trainingTitle.trim().toLowerCase()}|${r.month ?? ''}|${r.confidenceRating ?? ''}`)
  )
  return rows.filter(
    (r) => !seen.has(`${r.businessUnit.trim().toLowerCase()}|${r.trainingTitle.trim().toLowerCase()}|${r.month || ''}|${r.confidenceRating > 0 ? r.confidenceRating : ''}`)
  )
}

async function dedupeSubscription(rows: SubscriptionRow[]): Promise<SubscriptionRow[]> {
  const existing = await prisma.subscriptionRecord.findMany({ select: { staffId: true, membershipOrg: true, amount: true } })
  const seen = new Set(existing.map((r) => `${r.staffId.toUpperCase()}|${r.membershipOrg.trim().toLowerCase()}|${r.amount}`))
  return rows.filter((r) => !seen.has(`${r.staffId.toUpperCase()}|${r.membershipOrg.trim().toLowerCase()}|${r.amount}`))
}

async function dedupeKSS(rows: KSSRow[]): Promise<KSSRow[]> {
  const existing = await prisma.kSSRecord.findMany({ select: { staffId: true, durationMinutes: true, month: true } })
  const seen = new Set(existing.map((r) => `${r.staffId.toUpperCase()}|${r.durationMinutes}|${r.month ?? ''}`))
  return rows.filter((r) => !seen.has(`${r.staffId.toUpperCase()}|${r.durationMinutes}|${r.month || ''}`))
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

export interface SyncResult {
  success: boolean
  imported: Record<string, number>
  errors: { sheet: string; message: string }[]
}

export async function syncFromGoogleSheets(): Promise<SyncResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl) {
    return { success: false, imported: {}, errors: [{ sheet: 'Connection', message: 'No Google Sheet configured yet.' }] }
  }

  const errors: { sheet: string; message: string }[] = []
  const imported: Record<string, number> = {}

  let connection
  try {
    connection = await connectToSpreadsheet(config.spreadsheetUrl)
  } catch (err) {
    return {
      success: false,
      imported: {},
      errors: [{ sheet: 'Connection', message: err instanceof Error ? err.message : 'Failed to connect to Google Sheets.' }],
    }
  }

  const jobs = [
    { type: 'training' as const, sheetName: config.trainingSheetName, label: 'Training Cost' },
    { type: 'feedback' as const, sheetName: config.feedbackSheetName, label: 'Feedback' },
    { type: 'subscription' as const, sheetName: config.subscriptionSheetName, label: 'Subscriptions' },
    { type: 'kss' as const, sheetName: config.kssSheetName, label: 'KSS' },
  ]

  const filenamePrefix = `Google Sheets — ${connection.spreadsheetTitle}`
  const today = new Date().toISOString().slice(0, 10)

  for (const job of jobs) {
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
      } else if (job.type === 'feedback') {
        const { rows, errors: parseErrors, warnings } = parseFeedbackExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const newRows = await dedupeFeedback(rows)
        if (newRows.length === 0) { imported.feedback = 0; continue }
        const result = await importFeedbackRows(newRows, filename, null, warnings)
        imported.feedback = result.recordCount
      } else if (job.type === 'subscription') {
        const { rows, errors: parseErrors, warnings } = parseSubscriptionExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const newRows = await dedupeSubscription(rows)
        if (newRows.length === 0) { imported.subscription = 0; continue }
        const result = await importSubscriptionRows(newRows, filename, null, warnings)
        imported.subscription = result.recordCount
      } else if (job.type === 'kss') {
        const { rows, errors: parseErrors, warnings } = parseKSSExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const newRows = await dedupeKSS(rows)
        if (newRows.length === 0) { imported.kss = 0; continue }
        const result = await importKSSRows(newRows, filename, null, warnings)
        imported.kss = result.recordCount
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

  return { success, imported, errors }
}
