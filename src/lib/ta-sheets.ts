// Talent Acquisition — adapted from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/sheets.ts). The original used the `googleapis` npm package; this repo already has its
// own proven Google Sheets access pattern (JWT auth + raw REST fetch, see google-sheets.ts) for
// the Learning Intelligence sync, so this reuses that instead of adding a new dependency.
//
// Deliberately separate env vars from the L&D sync (TA_GOOGLE_SERVICE_ACCOUNT_EMAIL /
// TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / TA_GOOGLE_SHEET_ID) so the two integrations can never
// cross-contaminate — different Google Cloud project, different sheet, different owner.

import { JWT } from 'google-auth-library'
import { createPrivateKey } from 'crypto'
import { normalizePrivateKey } from './google-sheets'
import type { ConfigLists, DashboardData, HireRecord, OfferStatus, PipelineRecord } from './ta-types'
import { isOfferStatus } from './ta-metrics'
import { getSampleTaDashboardData } from './ta-sample-data'
import { findColumn, headerIndex, normalizeHeader } from './ta-sheet-columns'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

export const HIRES_RANGE = 'Hires!A1:O'
export const PIPELINE_RANGE = 'Pipeline!A1:H'
export const CONFIG_RANGE = 'Config!A1:F'

// Exported so pages can show an honest "sample data" banner instead of presenting demo numbers
// as if they were the real recruitment sheet.
export function hasTaCredentials(): boolean {
  return Boolean(process.env.TA_GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && process.env.TA_GOOGLE_SHEET_ID)
}

async function getTaAccessToken(): Promise<string> {
  const email = process.env.TA_GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!email || !rawKey) {
    throw new Error('Talent Acquisition Google Sheets credentials are not configured. Set TA_GOOGLE_SERVICE_ACCOUNT_EMAIL and TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.')
  }
  const key = normalizePrivateKey(rawKey)
  if (!key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not look like a valid private key (missing "-----BEGIN PRIVATE KEY-----"). Re-copy the full "private_key" value from the downloaded JSON file.')
  }
  try {
    createPrivateKey(key)
  } catch {
    throw new Error('TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is present but does not parse as a valid key — it likely got corrupted when pasted into Vercel. Re-copy it from the downloaded JSON key file.')
  }
  const client = new JWT({ email, key, scopes: [SHEETS_SCOPE] })
  const token = await client.authorize()
  if (!token.access_token) throw new Error('Failed to authenticate with Google for Talent Acquisition — check TA_GOOGLE_SERVICE_ACCOUNT_EMAIL/TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.')
  return token.access_token
}

async function fetchRange(spreadsheetId: string, range: string, accessToken: string): Promise<unknown[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (res.status === 404) throw new Error(`Talent Acquisition sheet tab not found for range "${range}". Check the sheet has Hires/Pipeline/Config tabs.`)
  if (res.status === 403) throw new Error(`Access denied reading Talent Acquisition sheet. Share it with ${process.env.TA_GOOGLE_SERVICE_ACCOUNT_EMAIL || 'the TA service account'} as at least Viewer.`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Sheets API error reading "${range}" (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { values?: unknown[][] }
  return data.values ?? []
}

/** Google Sheets serial date (days since 1899-12-30) -> JS Date, timezone-safe. */
function serialToDate(serial: number): Date {
  const epoch = Date.UTC(1899, 11, 30)
  return new Date(epoch + serial * 86400000)
}

function parseDateCell(value: unknown): Date | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return serialToDate(value)
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseNumberCell(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    const n = Number(cleaned)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function parseOptionalNumberCell(value: unknown): number | null {
  if (value == null || value === '') return null
  return parseNumberCell(value)
}

function parseHiresRows(rows: unknown[][]): HireRecord[] {
  if (rows.length === 0) return []
  const [header, ...body] = rows as string[][]
  const idx = headerIndex(header)

  const iId = findColumn(idx, 'id')
  const iName = findColumn(idx, 'candidateName')
  const iRole = findColumn(idx, 'role')
  const iBU = findColumn(idx, 'bu')
  const iReqStart = findColumn(idx, 'requisitionStartDate')
  const iOfferStatus = findColumn(idx, 'offerStatus')
  const iOfferExtended = findColumn(idx, 'offerExtendedDate')
  const iResumption = findColumn(idx, 'resumptionDate')
  const iManualWeeks = findColumn(idx, 'manualTimeToHireWeeks')
  const iMedical = findColumn(idx, 'medicalCost')
  const iAirtime = findColumn(idx, 'airtime')
  const iFeeding = findColumn(idx, 'feeding')
  const iManualTotal = findColumn(idx, 'manualTotalCost')
  const iOfficeType = findColumn(idx, 'officeType')
  const iHiringSource = findColumn(idx, 'hiringSource')

  return body
    .filter((row) => row.some((cell) => cell != null && cell !== ''))
    .map((row, i): HireRecord | null => {
      const get = (index: number | undefined) => (index == null ? undefined : row[index])
      const requisitionStartDate = parseDateCell(get(iReqStart))
      if (!requisitionStartDate) return null

      const rawStatus = String(get(iOfferStatus) ?? '').trim()
      const offerStatus: OfferStatus = isOfferStatus(rawStatus) ? rawStatus : 'Pending'

      return {
        id: String(get(iId) ?? `row-${i}`),
        candidateName: String(get(iName) ?? ''),
        role: String(get(iRole) ?? ''),
        bu: String(get(iBU) ?? ''),
        officeType: String(get(iOfficeType) ?? ''),
        hiringSource: String(get(iHiringSource) ?? ''),
        requisitionStartDate,
        offerStatus,
        offerExtendedDate: parseDateCell(get(iOfferExtended)),
        resumptionDate: parseDateCell(get(iResumption)),
        manualTimeToHireWeeks: parseOptionalNumberCell(get(iManualWeeks)),
        medicalCost: parseNumberCell(get(iMedical)),
        airtimeCost: parseNumberCell(get(iAirtime)),
        feedingCost: parseNumberCell(get(iFeeding)),
        manualTotalCost: parseOptionalNumberCell(get(iManualTotal)),
      }
    })
    .filter((r): r is HireRecord => r !== null)
}

function parsePipelineRows(rows: unknown[][]): PipelineRecord[] {
  if (rows.length === 0) return []
  const [header, ...body] = rows as string[][]
  const idx = headerIndex(header)

  const iId = findColumn(idx, 'id')
  const iName = findColumn(idx, 'candidateName')
  const iRole = findColumn(idx, 'role')
  const iBU = findColumn(idx, 'bu')
  const iOfficeType = findColumn(idx, 'officeType')
  const iHiringSource = findColumn(idx, 'hiringSource')
  const iReqStart = findColumn(idx, 'requisitionStartDate')
  const iStage = findColumn(idx, 'currentStage')

  return body
    .filter((row) => row.some((cell) => cell != null && cell !== ''))
    .map((row, i): PipelineRecord | null => {
      const get = (index: number | undefined) => (index == null ? undefined : row[index])
      const requisitionStartDate = parseDateCell(get(iReqStart))
      if (!requisitionStartDate) return null

      return {
        id: String(get(iId) ?? `pipeline-row-${i}`),
        candidateName: String(get(iName) ?? ''),
        role: String(get(iRole) ?? ''),
        bu: String(get(iBU) ?? ''),
        officeType: String(get(iOfficeType) ?? ''),
        hiringSource: String(get(iHiringSource) ?? ''),
        requisitionStartDate,
        currentStage: String(get(iStage) ?? ''),
      }
    })
    .filter((r): r is PipelineRecord => r !== null)
}

const EMPTY_CONFIG: ConfigLists = { bus: [], roles: [], offerStatuses: [], officeTypes: [], hiringSources: [], pipelineStages: [] }

function parseConfigColumns(rows: unknown[][]): ConfigLists {
  if (rows.length === 0) return EMPTY_CONFIG
  const [header, ...body] = rows as string[][]
  const idx = headerIndex(header)
  const colValues = (name: string): string[] => {
    const i = idx.get(normalizeHeader(name))
    if (i == null) return []
    return body.map((row) => row[i]).filter((v): v is string => Boolean(v && String(v).trim()))
  }
  return {
    bus: colValues('BUs'),
    roles: colValues('Roles'),
    offerStatuses: colValues('OfferStatuses').filter(isOfferStatus),
    officeTypes: colValues('OfficeTypes'),
    hiringSources: colValues('HiringSources'),
    pipelineStages: colValues('PipelineStages'),
  }
}

export interface TaDashboardResult extends DashboardData {
  /** Set when real credentials are configured but the fetch/parse failed for any reason (bad
   * key, wrong sheet ID, sheet not shared, tab names don't match) — the page shows this as an
   * actionable error banner instead of the whole route crashing with a server-side exception. */
  connectionError: string | null
}

/** Fetches and parses the Hires/Pipeline/Config tabs. Falls back to bundled sample data — with
 * no credentials configured yet (silently) or when a real connection attempt fails (with
 * `connectionError` set) — so a bad env var or a sheet-sharing mistake degrades to a visible
 * banner rather than a crashed page. */
export async function getTaDashboardData(): Promise<TaDashboardResult> {
  if (!hasTaCredentials()) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[ta-sheets] TA_GOOGLE_SERVICE_ACCOUNT_EMAIL/TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/TA_GOOGLE_SHEET_ID not set — showing sample data.')
    }
    return { ...getSampleTaDashboardData(), connectionError: null }
  }

  try {
    const spreadsheetId = process.env.TA_GOOGLE_SHEET_ID as string
    const accessToken = await getTaAccessToken()

    const [hiresRows, configRows, pipelineRows] = await Promise.all([
      fetchRange(spreadsheetId, HIRES_RANGE, accessToken),
      fetchRange(spreadsheetId, CONFIG_RANGE, accessToken),
      fetchRange(spreadsheetId, PIPELINE_RANGE, accessToken).catch(() => {
        console.warn('[ta-sheets] No "Pipeline" tab found — pipeline section will be empty.')
        return [] as unknown[][]
      }),
    ])

    return {
      records: parseHiresRows(hiresRows),
      config: parseConfigColumns(configRows),
      pipeline: parsePipelineRows(pipelineRows),
      connectionError: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error connecting to the Talent Acquisition sheet.'
    console.error('[ta-sheets] Falling back to sample data after a connection error:', message)
    return { ...getSampleTaDashboardData(), connectionError: message }
  }
}
