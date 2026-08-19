import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { connectToSpreadsheet } from '@/lib/google-sheets'
import { parseTrainingExcel, parseFeedbackExcel, parseSubscriptionExcel, parseKSSExcel } from '@/lib/excel-parser'
import { importTrainingRows, importFeedbackRows, importSubscriptionRows, importKSSRows } from '@/lib/import-records'

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
        const result = await importTrainingRows(rows, filename, null, warnings)
        imported.training = result.recordCount
      } else if (job.type === 'feedback') {
        const { rows, errors: parseErrors, warnings } = parseFeedbackExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const result = await importFeedbackRows(rows, filename, null, warnings)
        imported.feedback = result.recordCount
      } else if (job.type === 'subscription') {
        const { rows, errors: parseErrors, warnings } = parseSubscriptionExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const result = await importSubscriptionRows(rows, filename, null, warnings)
        imported.subscription = result.recordCount
      } else if (job.type === 'kss') {
        const { rows, errors: parseErrors, warnings } = parseKSSExcel(buffer)
        if (parseErrors.length) { errors.push({ sheet: job.label, message: parseErrors.join(' ') }); continue }
        if (rows.length === 0) { errors.push({ sheet: job.label, message: 'No data rows found.' }); continue }
        const result = await importKSSRows(rows, filename, null, warnings)
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
