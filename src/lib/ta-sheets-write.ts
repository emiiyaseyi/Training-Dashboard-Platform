// Talent Acquisition — write path for the TA Admin data editor. Separate file from ta-sheets.ts
// (which is read-only fetching/parsing) so the read path's behavior is never put at risk by
// touching this file.
//
// CRITICAL correctness constraint: the real sheet's column ORDER does not match any fixed
// assumption (confirmed directly — Hires' actual columns are Name, ROLE, Requisition start date,
// Resumption date, Offer Acceptance, ... — not in the order this app's types list them). Every
// write here re-reads the live header row first and places each field at its ACTUAL column
// index (via the same findColumn/HEADER_ALIASES used for reading), never at a hardcoded position.
// An update also re-reads the row's current values and only overwrites the specific cells being
// changed, so a column this editor doesn't know about is never silently blanked.

import { getTaAccessToken } from './ta-sheets'
import { findColumn, headerIndex, type SheetField } from './ta-sheet-columns'

function spreadsheetId(): string {
  const id = process.env.TA_GOOGLE_SHEET_ID
  if (!id) throw new Error('TA_GOOGLE_SHEET_ID is not configured.')
  return id
}

async function sheetsApi(path: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 403) throw new Error(`Write denied — the TA service account needs Editor access (not just Viewer) on the sheet. ${body.slice(0, 200)}`)
    throw new Error(`Google Sheets write failed (${res.status}): ${body.slice(0, 300)}`)
  }
  return res.json()
}

function colLetter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

async function fetchHeaderRow(sheetName: string, accessToken: string): Promise<string[]> {
  const range = `'${sheetName}'!1:1`
  const data = (await sheetsApi(`/values/${encodeURIComponent(range)}`, accessToken)) as { values?: string[][] }
  return data.values?.[0] ?? []
}

/** Serialized value per field — the caller formats dates as "YYYY-MM-DD" etc.; this layer only
 * handles placement, never formatting (see the admin route handlers for that). */
export type SheetFieldValues = Partial<Record<SheetField, string>>

/** Overwrites an existing row at `rowNumber` (1-indexed, matching HireRecord.rowNumber etc.) —
 * only the cells named in `values` change; every other cell on that row keeps its current
 * content. Throws with an actionable message on failure (403 → Editor access, anything else →
 * the raw API error) rather than failing silently. */
export async function updateSheetRow(sheetName: string, rowNumber: number, values: SheetFieldValues): Promise<void> {
  const accessToken = await getTaAccessToken()
  const header = await fetchHeaderRow(sheetName, accessToken)
  if (header.length === 0) throw new Error(`Could not read the header row for "${sheetName}" — check the tab still exists and is named correctly.`)
  const idx = headerIndex(header)
  const lastCol = colLetter(header.length - 1)
  const rowRange = `'${sheetName}'!A${rowNumber}:${lastCol}${rowNumber}`

  const existing = (await sheetsApi(`/values/${encodeURIComponent(rowRange)}`, accessToken)) as { values?: unknown[][] }
  const currentRow: unknown[] = existing.values?.[0] ?? []
  const newRow = [...currentRow]
  while (newRow.length < header.length) newRow.push('')

  for (const field of Object.keys(values) as SheetField[]) {
    const colIndex = findColumn(idx, field)
    if (colIndex == null) continue // the sheet has no column for this field — nothing to write
    newRow[colIndex] = values[field] ?? ''
  }

  await sheetsApi(`/values/${encodeURIComponent(rowRange)}?valueInputOption=USER_ENTERED`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ range: rowRange, majorDimension: 'ROWS', values: [newRow] }),
  })
}

/** Appends a brand-new row. Unlike updateSheetRow there's no existing content to preserve, so
 * every column this editor doesn't have a value for is simply left blank. Returns the new row's
 * sheet row number so the caller can show/link to it without a second fetch. */
export async function appendSheetRow(sheetName: string, values: SheetFieldValues): Promise<number> {
  const accessToken = await getTaAccessToken()
  const header = await fetchHeaderRow(sheetName, accessToken)
  if (header.length === 0) throw new Error(`Could not read the header row for "${sheetName}" — check the tab still exists and is named correctly.`)
  const idx = headerIndex(header)
  const newRow = new Array(header.length).fill('')

  for (const field of Object.keys(values) as SheetField[]) {
    const colIndex = findColumn(idx, field)
    if (colIndex == null) continue
    newRow[colIndex] = values[field] ?? ''
  }

  const lastCol = colLetter(header.length - 1)
  const appendRange = `'${sheetName}'!A1:${lastCol}1`
  const result = (await sheetsApi(
    `/values/${encodeURIComponent(appendRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    accessToken,
    { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values: [newRow] }) }
  )) as { updates?: { updatedRange?: string } }

  // updatedRange looks like "'Hires'!A57:O57" — pull the row number back out of it so the caller
  // doesn't have to guess (append can land anywhere past existing data, not necessarily "next").
  const match = result.updates?.updatedRange?.match(/![A-Z]+(\d+):/)
  if (!match) throw new Error('Row was appended but its row number could not be determined — reload to see it.')
  return Number(match[1])
}

/** Soft-delete: blanks every cell in the row rather than removing it from the sheet's grid
 * (a true row delete needs the tab's internal numeric sheetId and shifts every row below it,
 * which is a much larger blast radius for an admin action). The existing read-side parsers
 * already skip any row where every cell is empty, so a cleared row simply stops appearing
 * anywhere in the dashboard — the sheet keeps a blank row where it was, which is safe to re-fill
 * later or tidy up manually. */
export async function clearSheetRow(sheetName: string, rowNumber: number): Promise<void> {
  const accessToken = await getTaAccessToken()
  const header = await fetchHeaderRow(sheetName, accessToken)
  const lastCol = colLetter(Math.max(header.length, 1) - 1)
  const rowRange = `'${sheetName}'!A${rowNumber}:${lastCol}${rowNumber}`
  await sheetsApi(`/values/${encodeURIComponent(rowRange)}:clear`, accessToken, { method: 'POST', body: JSON.stringify({}) })
}
