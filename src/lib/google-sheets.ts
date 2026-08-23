import { JWT } from 'google-auth-library'
import { createPrivateKey } from 'crypto'
import * as XLSX from 'xlsx'

// Read+write — the sync engine only ever reads, but native survey form submissions append rows
// (Post-1/Post-2/Pre-Training), which needs write access. The spreadsheet must be shared with
// the service account as Editor, not just Viewer, for the append calls to succeed.
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
// drive.file (not the broader "drive" scope) — only grants access to files/folders the service
// account creates or that have been explicitly shared with it, which is exactly the Drive folders
// an admin shares for survey file-upload questions. Requested alongside Sheets so one token/JWT
// client covers both APIs.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Full URL: https://docs.google.com/spreadsheets/d/{id}/edit...
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (urlMatch) return urlMatch[1]
  // Already a bare ID (no slashes, reasonably long)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed
  return null
}

export function hasServiceAccountCredentials(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
}

export function serviceAccountEmail(): string | null {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null
}

// Private keys pasted into web forms (like Vercel's env var UI) frequently lose their real
// line breaks — collapsed onto one line, or with escaped "\n" text instead of actual newlines.
// Node's crypto decoder rejects a PEM key that isn't formatted exactly right (the
// "DECODER routines::unsupported" error), so rebuild it from scratch from whatever we're given.
function normalizePrivateKey(raw: string): string {
  let key = raw.trim()
  // Strip surrounding quotes, in case the whole env var value was pasted including them.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1)
  }
  key = key.replace(/\\n/g, '\n')

  const match = key.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/)
  if (match) {
    const body = match[1].replace(/\s+/g, '')
    const chunked = body.match(/.{1,64}/g)?.join('\n') ?? body
    return `-----BEGIN PRIVATE KEY-----\n${chunked}\n-----END PRIVATE KEY-----\n`
  }
  // No recognisable header/footer at all — return as-is so the real error surfaces below.
  return key
}

// Safe, non-sensitive diagnostics about the configured key's shape — never returns the key
// itself, only structural facts, so this can be surfaced in the admin UI/error messages.
export function privateKeyDiagnostics(): {
  configured: boolean
  rawLength: number
  hasBeginMarker: boolean
  hasEndMarker: boolean
  wrappedInQuotes: boolean
  containsLiteralBackslashN: boolean
  containsRealNewline: boolean
  lineCount: number
  normalizedParses: boolean
} {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!raw) {
    return {
      configured: false, rawLength: 0, hasBeginMarker: false, hasEndMarker: false,
      wrappedInQuotes: false, containsLiteralBackslashN: false, containsRealNewline: false,
      lineCount: 0, normalizedParses: false,
    }
  }
  const trimmed = raw.trim()
  let normalizedParses = false
  try {
    createPrivateKey(normalizePrivateKey(raw))
    normalizedParses = true
  } catch {
    normalizedParses = false
  }
  return {
    configured: true,
    rawLength: raw.length,
    hasBeginMarker: raw.includes('BEGIN') && raw.includes('PRIVATE KEY'),
    hasEndMarker: raw.includes('END') && raw.includes('PRIVATE KEY'),
    wrappedInQuotes: (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")),
    containsLiteralBackslashN: raw.includes('\\n'),
    containsRealNewline: raw.includes('\n'),
    lineCount: raw.split('\n').length,
    normalizedParses,
  }
}

export async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!email || !rawKey) {
    throw new Error(
      'Google Service Account not configured on the server. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and ' +
        'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to environment variables, then share the spreadsheet with that ' +
        'service account email as Editor (not just Viewer — survey forms and Training Schedule attendees write into the sheet).'
    )
  }
  const key = normalizePrivateKey(rawKey)
  if (!key.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not look like a valid private key (missing "-----BEGIN PRIVATE KEY-----"). ' +
        'Re-copy the full "private_key" value from the downloaded JSON file, including the BEGIN/END lines.'
    )
  }
  try {
    createPrivateKey(key)
  } catch {
    const d = privateKeyDiagnostics()
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is present but does not parse as a valid key even after cleanup ` +
        `(length ${d.rawLength}, ${d.lineCount} line(s), begin marker: ${d.hasBeginMarker}, end marker: ${d.hasEndMarker}). ` +
        `This usually means the value got truncated or corrupted when pasted into Vercel. Re-open the downloaded ` +
        `JSON key file, select and copy only the "private_key" value (the whole quoted string), and paste it into ` +
        `Vercel's env var field, then redeploy. If it's still wrong, try generating a brand new key from Google Cloud Console.`
    )
  }
  try {
    const client = new JWT({ email, key, scopes: [SHEETS_SCOPE, DRIVE_SCOPE] })
    const token = await client.authorize()
    if (!token.access_token) throw new Error('Failed to authenticate with Google — check the Service Account credentials.')
    return token.access_token
  } catch (err) {
    if (err instanceof Error && /DECODER|unsupported|PEM/i.test(err.message)) {
      throw new Error(
        'Could not parse GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — it looks corrupted (a common issue when pasting into ' +
          'Vercel\'s env var field). Re-copy the "private_key" value directly from the downloaded JSON file and paste ' +
          'it in as one field value, then redeploy.'
      )
    }
    throw err
  }
}

export interface SheetsConnection {
  spreadsheetId: string
  accessToken: string
  tabTitles: string[]
  spreadsheetTitle: string
}

// Verifies the service account can reach the spreadsheet at all, and returns the list of tab
// names present — the first thing that goes wrong (bad ID, not shared with the service account,
// bad credentials) surfaces here with a specific, actionable message.
export async function connectToSpreadsheet(spreadsheetIdOrUrl: string): Promise<SheetsConnection> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl)
  if (!spreadsheetId) {
    throw new Error('Could not read a Spreadsheet ID from that link. Paste the full Google Sheets URL or just the ID.')
  }

  const accessToken = await getAccessToken()

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (res.status === 404) {
    throw new Error('Spreadsheet not found. Double-check the link.')
  }
  if (res.status === 403) {
    const email = serviceAccountEmail()
    throw new Error(
      `Access denied. Share the spreadsheet with the service account (${email || 'see GOOGLE_SERVICE_ACCOUNT_EMAIL'}) as at least Viewer.`
    )
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Sheets API error (${res.status}): ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as { properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }
  const tabTitles = (data.sheets || []).map((s) => s.properties?.title || '').filter(Boolean)

  return {
    spreadsheetId,
    accessToken,
    tabTitles,
    spreadsheetTitle: data.properties?.title || spreadsheetId,
  }
}

// Reads just the header row (row 1) of a named tab.
export async function fetchSheetHeaderRow(spreadsheetId: string, sheetName: string, accessToken: string): Promise<string[]> {
  const range = `${sheetName}!1:1`
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Could not read tab "${sheetName}" (${res.status}): ${body.slice(0, 150)}`)
  }
  const data = (await res.json()) as { values?: string[][] }
  return (data.values?.[0] || []).map((h) => String(h ?? '').trim())
}

// Appends one row to a named tab (after its last row) — used to mirror native survey form
// submissions into a Google Sheet for the admin's own visibility, alongside the database write.
// Requires the spreadsheet to be shared with the service account as Editor, not just Viewer.
export async function appendRowToSheet(spreadsheetId: string, sheetName: string, accessToken: string, values: (string | number)[]): Promise<void> {
  return appendRowsToSheet(spreadsheetId, sheetName, accessToken, [values])
}

// Appends multiple rows in one API call — used wherever several rows need mirroring at once (e.g.
// every attendee added to a training schedule in one go), so the cost is one round-trip for the
// whole batch instead of one per row.
export async function appendRowsToSheet(spreadsheetId: string, sheetName: string, accessToken: string, rows: (string | number)[][]): Promise<void> {
  if (rows.length === 0) return
  const range = `${sheetName}!A1`
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 403) {
      throw new Error(`Cannot write to tab "${sheetName}" — the service account needs Editor access to the spreadsheet, not just Viewer.`)
    }
    throw new Error(`Could not write to tab "${sheetName}" (${res.status}): ${body.slice(0, 200)}`)
  }
}

// Pulls the full contents of a tab and reassembles it as an XLSX buffer so it can go through the
// exact same parseXExcel() functions used for file uploads — every reader of a sheet (bulk sync,
// the comprehensive staff list supplement) interprets columns identically to a manual upload.
export async function fetchSheetAsBuffer(spreadsheetId: string, sheetName: string, accessToken: string): Promise<Buffer> {
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

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface MirrorField {
  label: string
  candidates: string[]
  value: string | number
}

// 0-based column index -> A1 letter(s): 0 -> A, 25 -> Z, 26 -> AA, ...
function columnLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Reads every row of a tab as plain string values (header row included, at index 0) — used for
// row lookups where the XLSX buffer round-trip (fetchSheetAsBuffer) isn't needed.
async function fetchSheetValues(spreadsheetId: string, sheetName: string, accessToken: string): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Could not read tab "${sheetName}" (${res.status}): ${body.slice(0, 150)}`)
  }
  const data = (await res.json()) as { values?: unknown[][] }
  return (data.values || []).map((row) => row.map((c) => String(c ?? '')))
}

// Finds the row whose `keyColumnCandidates` cell matches `keyValue` (case/punctuation-insensitive)
// and overwrites specific OTHER cells on that same row — unlike appendMirrorRow (which only ever
// adds new rows), this edits an existing row in place, so it's used for narrowly-scoped updates
// only (e.g. filling in a derived Line Manager Name/Email once a Line Manager ID is set) where the
// key match is unambiguous. Columns that don't exist are reported back rather than created, since
// blindly extending a row-update's target columns is riskier than doing so for a fresh append.
export async function updateRowByKey(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
  keyColumnCandidates: string[],
  keyValue: string,
  updates: { columnCandidates: string[]; value: string }[]
): Promise<{ rowFound: boolean; missingColumns: string[] }> {
  const rows = await fetchSheetValues(spreadsheetId, sheetName, accessToken)
  if (rows.length === 0) return { rowFound: false, missingColumns: [] }

  const headers = rows[0]
  const normHeaders = headers.map(normaliseHeader)
  const normKeyCandidates = keyColumnCandidates.map(normaliseHeader)
  const keyColIdx = normHeaders.findIndex((h) => normKeyCandidates.some((c) => c === h || (c.length >= 4 && (h.includes(c) || c.includes(h)))))
  if (keyColIdx === -1) return { rowFound: false, missingColumns: updates.map((u) => u.columnCandidates[0]) }

  const normKeyValue = normaliseHeader(keyValue)
  const rowIdx = rows.slice(1).findIndex((r) => normaliseHeader(r[keyColIdx] || '') === normKeyValue)
  if (rowIdx === -1) return { rowFound: false, missingColumns: [] }
  const sheetRowNumber = rowIdx + 2 // +1 for header row, +1 for 1-based indexing

  const missingColumns: string[] = []
  for (const update of updates) {
    const normCandidates = update.columnCandidates.map(normaliseHeader)
    const colIdx = normHeaders.findIndex((h) => normCandidates.some((c) => c === h || (c.length >= 4 && (h.includes(c) || c.includes(h)))))
    if (colIdx === -1) {
      missingColumns.push(update.columnCandidates[0])
      continue
    }
    const cell = `${columnLetter(colIdx)}${sheetRowNumber}`
    await updateSheetRange(spreadsheetId, sheetName, accessToken, `${sheetName}!${cell}`, [[update.value]])
  }

  return { rowFound: true, missingColumns }
}

// Same job as calling updateRowByKey once per row, but does exactly one sheet read and one
// Sheets API write for the whole batch, instead of one of each per row — for bulk backfills
// (e.g. "update missing details" over an entire roster) where updateRowByKey's per-call
// full-tab-read would mean dozens of redundant round-trips.
export async function batchUpdateRowsByKey(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
  keyColumnCandidates: string[],
  rows_: { keyValue: string; updates: { columnCandidates: string[]; value: string }[] }[]
): Promise<{ found: number; notFound: string[] }> {
  const rows = await fetchSheetValues(spreadsheetId, sheetName, accessToken)
  if (rows.length === 0) return { found: 0, notFound: rows_.map((r) => r.keyValue) }

  const headers = rows[0]
  const normHeaders = headers.map(normaliseHeader)
  const normKeyCandidates = keyColumnCandidates.map(normaliseHeader)
  const keyColIdx = normHeaders.findIndex((h) => normKeyCandidates.some((c) => c === h || (c.length >= 4 && (h.includes(c) || c.includes(h)))))
  if (keyColIdx === -1) return { found: 0, notFound: rows_.map((r) => r.keyValue) }

  const rowIndexByKey = new Map<string, number>()
  rows.slice(1).forEach((r, i) => {
    const k = normaliseHeader(r[keyColIdx] || '')
    if (k) rowIndexByKey.set(k, i + 2) // +1 header row, +1 for 1-based indexing
  })

  const colIdxCache = new Map<string, number>()
  const colIdxFor = (candidates: string[]) => {
    const key = candidates.join('|')
    if (colIdxCache.has(key)) return colIdxCache.get(key)!
    const normCandidates = candidates.map(normaliseHeader)
    const idx = normHeaders.findIndex((h) => normCandidates.some((c) => c === h || (c.length >= 4 && (h.includes(c) || c.includes(h)))))
    colIdxCache.set(key, idx)
    return idx
  }

  const data: { range: string; values: string[][] }[] = []
  const notFound: string[] = []
  let found = 0

  for (const { keyValue, updates } of rows_) {
    const sheetRowNumber = rowIndexByKey.get(normaliseHeader(keyValue))
    if (!sheetRowNumber) { notFound.push(keyValue); continue }
    found++
    for (const update of updates) {
      const colIdx = colIdxFor(update.columnCandidates)
      if (colIdx === -1) continue
      data.push({ range: `${sheetName}!${columnLetter(colIdx)}${sheetRowNumber}`, values: [[update.value]] })
    }
  }

  if (data.length > 0) {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
      }
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Batch update failed on tab "${sheetName}" (${res.status}): ${body.slice(0, 200)}`)
    }
  }

  return { found, notFound }
}

// Same job as batchUpdateRowsByKey, but the row identity is a combination of several columns
// (e.g. Name + Training + Month) rather than one — needed wherever no single column is unique
// enough on its own (a recurring training means the same Name+Training pair repeats every month;
// Staff ID can't be used at all here since it's sometimes the very field being corrected).
export async function batchUpdateRowsByCompoundKey(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
  keyPartsCandidates: string[][],
  rows_: { keyParts: string[]; updates: { columnCandidates: string[]; value: string }[] }[]
): Promise<{ found: number; notFound: number; error?: string }> {
  const rows = await fetchSheetValues(spreadsheetId, sheetName, accessToken)
  if (rows.length === 0) return { found: 0, notFound: rows_.length, error: 'The tab has no rows.' }

  const headers = rows[0]
  const normHeaders = headers.map(normaliseHeader)
  const keyColIdxs = keyPartsCandidates.map((candidates) => {
    const normCandidates = candidates.map(normaliseHeader)
    return normHeaders.findIndex((h) => normCandidates.some((c) => c === h || (c.length >= 4 && (h.includes(c) || c.includes(h)))))
  })
  if (keyColIdxs.some((idx) => idx === -1)) {
    const missingIdx = keyColIdxs.findIndex((idx) => idx === -1)
    return {
      found: 0,
      notFound: rows_.length,
      error: `Could not find a column in the sheet matching any of: ${keyPartsCandidates[missingIdx].join(', ')}. Sheet columns found: ${headers.join(', ')}.`,
    }
  }

  const compoundKey = (parts: string[]) => parts.map(normaliseHeader).join('|')

  const rowIndexByKey = new Map<string, number>()
  rows.slice(1).forEach((r, i) => {
    const parts = keyColIdxs.map((idx) => r[idx] || '')
    if (parts.every(Boolean)) rowIndexByKey.set(compoundKey(parts), i + 2) // +1 header row, +1 for 1-based indexing
  })

  const colIdxCache = new Map<string, number>()
  const colIdxFor = (candidates: string[]) => {
    const key = candidates.join('|')
    if (colIdxCache.has(key)) return colIdxCache.get(key)!
    const normCandidates = candidates.map(normaliseHeader)
    const idx = normHeaders.findIndex((h) => normCandidates.some((c) => c === h || (c.length >= 4 && (h.includes(c) || c.includes(h)))))
    colIdxCache.set(key, idx)
    return idx
  }

  const data: { range: string; values: string[][] }[] = []
  let found = 0
  let notFound = 0

  for (const { keyParts, updates } of rows_) {
    const sheetRowNumber = rowIndexByKey.get(compoundKey(keyParts))
    if (!sheetRowNumber) { notFound++; continue }
    found++
    for (const update of updates) {
      const colIdx = colIdxFor(update.columnCandidates)
      if (colIdx === -1) continue
      data.push({ range: `${sheetName}!${columnLetter(colIdx)}${sheetRowNumber}`, values: [[update.value]] })
    }
  }

  // Headers matched, but not one row matched by value — almost always means the key values
  // themselves differ between the DB and the sheet (a name spelled differently, a month written
  // as "March 2026" in the sheet vs "March" in the DB, etc). Surface a few real examples of both
  // sides so the mismatch is diagnosable without needing direct access to the sheet.
  let error: string | undefined
  if (found === 0 && notFound > 0) {
    const wanted = rows_.slice(0, 3).map((r) => compoundKey(r.keyParts))
    const actual = [...rowIndexByKey.keys()].slice(0, 3)
    error = `No rows matched by value. Looked for keys like: ${wanted.join(' | ')}. Sheet has keys like: ${actual.join(' | ')}.`
  }

  if (data.length > 0) {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
      }
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Batch update failed on tab "${sheetName}" (${res.status}): ${body.slice(0, 200)}`)
    }
  }

  return { found, notFound, error }
}

// Overwrites a specific range (e.g. new header cells) rather than appending — used to extend the
// header row in place when a field has no existing column to land in.
async function updateSheetRange(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
  range: string,
  values: (string | number)[][]
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Could not update headers on tab "${sheetName}" (${res.status}): ${body.slice(0, 200)}`)
  }
}

// Appends one row to a tab, self-aligning to whatever header row already exists there instead of
// assuming a fixed column order. This matters because a mirror tab (e.g. a native survey form's
// Google Sheet mirror) can be the SAME tab an admin already uses for bulk Excel uploads, with its
// own pre-existing header row — blindly appending values in our own fixed order would land them
// under the wrong headers. Matching mirrors the two-pass "exact, then loose substring (>=4 chars)"
// strategy used by findHeader() in excel-parser.ts, so behaviour stays consistent across the app.
// Any field with no matching existing column gets its own new header appended (rather than being
// silently dropped) — this also covers a completely blank tab, where every field is "unmatched"
// and the whole header row gets created from scratch.
// Note: concurrent submissions racing on the same never-before-seen field could each add their own
// copy of that column; with survey response volumes this is rare and self-heals (later submissions
// match the first copy they find), so it isn't worth a locking scheme.
export async function appendMirrorRow(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
  fields: MirrorField[]
): Promise<void> {
  const existingHeaders = await fetchSheetHeaderRow(spreadsheetId, sheetName, accessToken)
  const normHeaders = existingHeaders.map(normaliseHeader)
  const fieldCandidates = fields.map((f) => [normaliseHeader(f.label), ...f.candidates.map(normaliseHeader)].filter(Boolean))
  const used = new Set<number>()

  const matchFor = (h: string, allowSubstring: boolean): number => {
    for (let i = 0; i < fields.length; i++) {
      if (used.has(i)) continue
      const cands = fieldCandidates[i]
      if (cands.some((c) => c === h)) return i
      if (allowSubstring && cands.some((c) => c.length >= 4 && (h.includes(c) || c.includes(h)))) return i
    }
    return -1
  }

  const row: (string | number)[] = new Array(existingHeaders.length).fill('')
  normHeaders.forEach((h, idx) => {
    const m = matchFor(h, false)
    if (m >= 0) { row[idx] = fields[m].value; used.add(m) }
  })
  normHeaders.forEach((h, idx) => {
    if (row[idx] !== '') return
    const m = matchFor(h, true)
    if (m >= 0) { row[idx] = fields[m].value; used.add(m) }
  })

  const unmatchedFields = fields.filter((_, i) => !used.has(i))
  if (unmatchedFields.length > 0) {
    const startCol = columnLetter(existingHeaders.length)
    const endCol = columnLetter(existingHeaders.length + unmatchedFields.length - 1)
    await updateSheetRange(
      spreadsheetId, sheetName, accessToken,
      `${sheetName}!${startCol}1:${endCol}1`,
      [unmatchedFields.map((f) => f.label)]
    )
    row.push(...unmatchedFields.map((f) => f.value))
  }

  await appendRowToSheet(spreadsheetId, sheetName, accessToken, row)
}

// Batch sibling of appendMirrorRow — for mirroring several rows that all share the same field
// shape (e.g. every attendee just added to one training schedule) in one read-headers +
// (at most one) extend-headers + one append, instead of repeating that whole sequence per row.
// Column alignment is computed once from the first row's fields, since every row in a batch call
// has identical labels/candidates and only the values differ.
export async function appendMirrorRows(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
  fieldsList: MirrorField[][]
): Promise<void> {
  if (fieldsList.length === 0) return

  const existingHeaders = await fetchSheetHeaderRow(spreadsheetId, sheetName, accessToken)
  const normHeaders = existingHeaders.map(normaliseHeader)
  const fields = fieldsList[0]
  const fieldCandidates = fields.map((f) => [normaliseHeader(f.label), ...f.candidates.map(normaliseHeader)].filter(Boolean))
  const used = new Set<number>()
  const colForField: number[] = new Array(fields.length).fill(-1)

  const matchFor = (h: string, allowSubstring: boolean): number => {
    for (let i = 0; i < fields.length; i++) {
      if (used.has(i)) continue
      const cands = fieldCandidates[i]
      if (cands.some((c) => c === h)) return i
      if (allowSubstring && cands.some((c) => c.length >= 4 && (h.includes(c) || c.includes(h)))) return i
    }
    return -1
  }

  normHeaders.forEach((h, idx) => {
    const m = matchFor(h, false)
    if (m >= 0) { colForField[m] = idx; used.add(m) }
  })
  normHeaders.forEach((h, idx) => {
    if (colForField.includes(idx)) return
    const m = matchFor(h, true)
    if (m >= 0) { colForField[m] = idx; used.add(m) }
  })

  const unmatchedFieldIdx = fields.map((_, i) => i).filter((i) => !used.has(i))
  let totalCols = existingHeaders.length
  if (unmatchedFieldIdx.length > 0) {
    const startCol = columnLetter(existingHeaders.length)
    const endCol = columnLetter(existingHeaders.length + unmatchedFieldIdx.length - 1)
    await updateSheetRange(
      spreadsheetId, sheetName, accessToken,
      `${sheetName}!${startCol}1:${endCol}1`,
      [unmatchedFieldIdx.map((i) => fields[i].label)]
    )
    unmatchedFieldIdx.forEach((fieldIdx, k) => { colForField[fieldIdx] = totalCols + k })
    totalCols += unmatchedFieldIdx.length
  }

  const rows = fieldsList.map((rowFields) => {
    const row: (string | number)[] = new Array(totalCols).fill('')
    rowFields.forEach((f, i) => {
      const col = colForField[i]
      if (col >= 0) row[col] = f.value
    })
    return row
  })

  await appendRowsToSheet(spreadsheetId, sheetName, accessToken, rows)
}

// Checks that at least one of `candidates` appears (as substring, either direction) among `headers`.
function hasMatchingColumn(headers: string[], candidates: string[]): boolean {
  const normHeaders = headers.map(normaliseHeader)
  const normCandidates = candidates.map(normaliseHeader)
  return normHeaders.some((h) => normCandidates.some((c) => h.includes(c) || c.includes(h)))
}

export interface RequiredColumn {
  label: string
  candidates: string[]
}

export const SHEET_REQUIRED_COLUMNS: Record<'training' | 'feedback' | 'subscription' | 'kss', RequiredColumn[]> = {
  training: [
    { label: 'Name', candidates: ['name', 'staffname', 'employeename', 'fullname'] },
    { label: 'Business Unit', candidates: ['businessunit', 'department', 'unit', 'bu'] },
    { label: 'Cost', candidates: ['cost', 'amount', 'fee', 'trainingcost', 'spend'] },
  ],
  feedback: [
    { label: 'Business Unit', candidates: ['businessunit', 'department', 'unit', 'bu'] },
    { label: 'Training Title', candidates: ['trainingtitle', 'training', 'course', 'programme'] },
  ],
  subscription: [
    { label: 'Name', candidates: ['name', 'staffname', 'fullname'] },
    { label: 'Business Unit', candidates: ['businessunit', 'department', 'unit', 'bu'] },
    { label: 'Membership Organization', candidates: ['membershiporganization', 'organization', 'membership', 'professionalbody'] },
    { label: 'Amount', candidates: ['amount', 'cost', 'fee', 'subscriptioncost'] },
  ],
  kss: [
    { label: 'Name', candidates: ['name', 'staffname', 'fullname', 'employeename'] },
    { label: 'Business Unit', candidates: ['businessunit', 'department', 'unit', 'bu'] },
    { label: 'In-Meeting Duration', candidates: ['inmeetingduration', 'duration', 'meetingduration', 'minutes'] },
  ],
}

export function findMissingColumns(headers: string[], type: keyof typeof SHEET_REQUIRED_COLUMNS): string[] {
  return SHEET_REQUIRED_COLUMNS[type]
    .filter((req) => !hasMatchingColumn(headers, req.candidates))
    .map((req) => `Missing a "${req.label}" column (looked for: ${req.candidates.join(', ')}).`)
}
