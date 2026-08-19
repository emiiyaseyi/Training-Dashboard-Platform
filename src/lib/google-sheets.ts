import { JWT } from 'google-auth-library'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

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

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!email || !rawKey) {
    throw new Error(
      'Google Service Account not configured on the server. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and ' +
        'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to environment variables, then share the spreadsheet with that ' +
        'service account email (Viewer access is enough).'
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
    const client = new JWT({ email, key, scopes: [SHEETS_SCOPE] })
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

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
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
