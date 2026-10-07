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
import type { ConfigLists, DashboardData, HireRecord, OfferStatus, PipelineRecord, InternalMobilityRecord, ConversionRecord, NotConvertedRecord, VacancyRecord } from './ta-types'
import { canonicalOfferStatus, isOfferStatus } from './ta-metrics'
import { getSampleTaDashboardData } from './ta-sample-data'
import { findColumn, headerIndex, normalizeHeader } from './ta-sheet-columns'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

// Sheet names are single-quoted per Google's A1 notation — required whenever a name contains a
// space (bare `Internal Mobility!A1:I` is INVALID_ARGUMENT, "Unable to parse range"); harmless to
// quote the single-word ones too, so every range here is quoted for consistency.
export const HIRES_RANGE = "'Hires'!A1:O"
export const PIPELINE_RANGE = "'Pipeline'!A1:H"
export const CONFIG_RANGE = "'Config'!A1:F"
export const INTERNAL_MOBILITY_RANGE = "'Internal Mobility'!A1:I"
export const CONVERSION_RANGE = "'Conversion'!A1:J"
export const NOT_CONVERTED_RANGE = "'Not Converted'!A1:H"
export const VACANCIES_RANGE = "'Vacancies'!A1:H"

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

interface HiresParseResult {
  records: HireRecord[]
  /** Raw Offer Status/Offer Acceptance values that didn't match anything recognized (and so got
   * counted as Pending) — surfaced on the admin page instead of silently miscounting hires as
   * still-pending. */
  unrecognizedOfferStatuses: { value: string; count: number }[]
  /** Rows whose Resumption Date fell before their Requisition Start Date (almost always a typo'd
   * year on one of the two cells, e.g. 1/1/2006 for 1/1/2026) — the resumption date is dropped for
   * these so a single bad row can't drag Average Time to Fill into a huge negative number, but
   * the row itself is kept (it's still a real hire). Surfaced so the sheet can be corrected. */
  suspiciousResumptionDates: number
}

/** Yes/No → Accepted/Declined, for sheets using a simple "Offer Acceptance" column instead of a
 * 4-value Offer Status column. No sheet has a visible way to express Pending/Withdrawn in that
 * scheme, so a value outside Yes/No here is genuinely unrecognized rather than guessed at. */
function offerAcceptedToStatus(raw: string): OfferStatus | null {
  const norm = raw.trim().toLowerCase()
  if (norm === 'yes') return 'Accepted'
  if (norm === 'no') return 'Declined'
  return null
}

function parseHiresRows(rows: unknown[][]): HiresParseResult {
  if (rows.length === 0) return { records: [], unrecognizedOfferStatuses: [], suspiciousResumptionDates: 0 }
  const [header, ...body] = rows as string[][]
  const idx = headerIndex(header)

  const iId = findColumn(idx, 'id')
  const iName = findColumn(idx, 'candidateName')
  const iRole = findColumn(idx, 'role')
  const iBU = findColumn(idx, 'bu')
  const iReqStart = findColumn(idx, 'requisitionStartDate')
  const iOfferStatus = findColumn(idx, 'offerStatus')
  const iOfferAccepted = findColumn(idx, 'offerAccepted')
  const iOfferExtended = findColumn(idx, 'offerExtendedDate')
  const iResumption = findColumn(idx, 'resumptionDate')
  const iManualWeeks = findColumn(idx, 'manualTimeToHireWeeks')
  const iMedical = findColumn(idx, 'medicalCost')
  const iAirtime = findColumn(idx, 'airtime')
  const iFeeding = findColumn(idx, 'feeding')
  const iHbu = findColumn(idx, 'hbuCost')
  const iTei = findColumn(idx, 'teiCost')
  const iManualTotal = findColumn(idx, 'manualTotalCost')
  const iOfficeType = findColumn(idx, 'officeType')
  const iHiringSource = findColumn(idx, 'hiringSource')

  const unrecognizedCounts = new Map<string, number>()
  let suspiciousResumptionDates = 0

  const records = body
    .filter((row) => row.some((cell) => cell != null && cell !== ''))
    .map((row, i): HireRecord | null => {
      const get = (index: number | undefined) => (index == null ? undefined : row[index])
      const requisitionStartDate = parseDateCell(get(iReqStart))
      if (!requisitionStartDate) return null

      const rawStatus = String(get(iOfferStatus) ?? '').trim()
      const rawAccepted = String(get(iOfferAccepted) ?? '').trim()
      const matched = iOfferStatus != null ? canonicalOfferStatus(rawStatus) : offerAcceptedToStatus(rawAccepted)
      const rawForDiagnostics = iOfferStatus != null ? rawStatus : rawAccepted
      if (!matched && rawForDiagnostics) unrecognizedCounts.set(rawForDiagnostics, (unrecognizedCounts.get(rawForDiagnostics) ?? 0) + 1)
      const offerStatus: OfferStatus = matched ?? 'Pending'

      let resumptionDate = parseDateCell(get(iResumption))
      if (resumptionDate && resumptionDate.getTime() < requisitionStartDate.getTime()) {
        suspiciousResumptionDates += 1
        resumptionDate = null
      }

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
        resumptionDate,
        manualTimeToHireWeeks: parseOptionalNumberCell(get(iManualWeeks)),
        medicalCost: parseNumberCell(get(iMedical)),
        airtimeCost: parseNumberCell(get(iAirtime)),
        feedingCost: parseNumberCell(get(iFeeding)),
        hbuCost: parseNumberCell(get(iHbu)),
        teiCost: parseNumberCell(get(iTei)),
        manualTotalCost: parseOptionalNumberCell(get(iManualTotal)),
      }
    })
    .filter((r): r is HireRecord => r !== null)

  return {
    records,
    unrecognizedOfferStatuses: [...unrecognizedCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    suspiciousResumptionDates,
  }
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

function parseInternalMobilityRows(rows: unknown[][]): InternalMobilityRecord[] {
  if (rows.length === 0) return []
  const [header, ...body] = rows as string[][]
  const idx = headerIndex(header)

  const iStaffId = findColumn(idx, 'staffId')
  const iName = findColumn(idx, 'name')
  const iCurrentBU = findColumn(idx, 'currentBU')
  const iCurrentRole = findColumn(idx, 'currentRole')
  const iPreviousBU = findColumn(idx, 'previousBU')
  const iPreviousRole = findColumn(idx, 'previousRole')
  const iDeploymentMonth = findColumn(idx, 'deploymentMonth')
  const iPreviousGrade = findColumn(idx, 'previousGrade')
  const iNewGrade = findColumn(idx, 'newGrade')

  return body
    .filter((row) => row.some((cell) => cell != null && cell !== ''))
    .map((row): InternalMobilityRecord => {
      const get = (index: number | undefined) => (index == null ? undefined : row[index])
      return {
        staffId: String(get(iStaffId) ?? '').trim(),
        name: String(get(iName) ?? ''),
        currentBU: String(get(iCurrentBU) ?? ''),
        currentRole: String(get(iCurrentRole) ?? ''),
        previousBU: String(get(iPreviousBU) ?? ''),
        previousRole: String(get(iPreviousRole) ?? ''),
        deploymentMonth: String(get(iDeploymentMonth) ?? '').trim(),
        previousGrade: String(get(iPreviousGrade) ?? ''),
        newGrade: String(get(iNewGrade) ?? ''),
      }
    })
}

function parseConversionRows(rows: unknown[][]): ConversionRecord[] {
  if (rows.length === 0) return []
  const [header, ...body] = rows as string[][]
  const idx = headerIndex(header)

  const iStaffId = findColumn(idx, 'staffId')
  const iName = findColumn(idx, 'name')
  const iBU = findColumn(idx, 'bu')
  const iRole = findColumn(idx, 'role')
  const iInternStart = findColumn(idx, 'internStartDate')
  const iGrade = findColumn(idx, 'grade')
  const iEffectiveDate = findColumn(idx, 'conversionEffectiveDate')
  const iManager = findColumn(idx, 'manager')
  const iOfferRate = findColumn(idx, 'offerRate')
  const iCost = findColumn(idx, 'costPerConversion')

  return body
    .filter((row) => row.some((cell) => cell != null && cell !== ''))
    .map((row): ConversionRecord | null => {
      const get = (index: number | undefined) => (index == null ? undefined : row[index])
      const conversionEffectiveDate = parseDateCell(get(iEffectiveDate))
      if (!conversionEffectiveDate) return null
      return {
        staffId: String(get(iStaffId) ?? '').trim(),
        name: String(get(iName) ?? ''),
        bu: String(get(iBU) ?? ''),
        role: String(get(iRole) ?? ''),
        internStartDate: parseDateCell(get(iInternStart)),
        grade: String(get(iGrade) ?? ''),
        conversionEffectiveDate,
        manager: String(get(iManager) ?? ''),
        offerRate: get(iOfferRate) != null && get(iOfferRate) !== '' ? String(get(iOfferRate)) : null,
        costPerConversion: parseOptionalNumberCell(get(iCost)),
      }
    })
    .filter((r): r is ConversionRecord => r !== null)
}

function parseNotConvertedRows(rows: unknown[][]): NotConvertedRecord[] {
  if (rows.length === 0) return []
  const [header, ...body] = rows as string[][]
  const idx = headerIndex(header)

  const iStaffId = findColumn(idx, 'staffId')
  const iName = findColumn(idx, 'name')
  const iBU = findColumn(idx, 'bu')
  const iRole = findColumn(idx, 'role')
  const iEmploymentStart = findColumn(idx, 'employmentStartDate')
  const iGrade = findColumn(idx, 'grade')
  const iManager = findColumn(idx, 'manager')
  const iReason = findColumn(idx, 'reason')

  return body
    .filter((row) => row.some((cell) => cell != null && cell !== ''))
    .map((row): NotConvertedRecord => {
      const get = (index: number | undefined) => (index == null ? undefined : row[index])
      return {
        staffId: String(get(iStaffId) ?? '').trim(),
        name: String(get(iName) ?? ''),
        bu: String(get(iBU) ?? ''),
        role: String(get(iRole) ?? ''),
        employmentStartDate: parseDateCell(get(iEmploymentStart)),
        grade: String(get(iGrade) ?? ''),
        manager: String(get(iManager) ?? ''),
        reason: String(get(iReason) ?? ''),
      }
    })
}

function parseVacancyRows(rows: unknown[][]): VacancyRecord[] {
  if (rows.length === 0) return []
  const [header, ...body] = rows as string[][]
  const idx = headerIndex(header)

  const iRole = findColumn(idx, 'role')
  const iBU = findColumn(idx, 'bu')
  const iCount = findColumn(idx, 'numberOfVacancies')
  const iLocation = findColumn(idx, 'location')
  const iGrade = findColumn(idx, 'grade')
  const iStatus = findColumn(idx, 'status')
  const iDateOpened = findColumn(idx, 'dateOpened')
  const iDateFilled = findColumn(idx, 'dateFilled')

  return body
    .filter((row) => row.some((cell) => cell != null && cell !== ''))
    .map((row): VacancyRecord => {
      const get = (index: number | undefined) => (index == null ? undefined : row[index])
      return {
        role: String(get(iRole) ?? ''),
        bu: String(get(iBU) ?? ''),
        numberOfVacancies: parseNumberCell(get(iCount)),
        location: String(get(iLocation) ?? ''),
        grade: String(get(iGrade) ?? ''),
        status: String(get(iStatus) ?? ''),
        dateOpened: parseDateCell(get(iDateOpened)),
        // dateFilled stays null for every row until a "Date Filled" column exists on the sheet —
        // Time to Fill can't be computed without it (see ta-types.ts's VacancyRecord comment).
        dateFilled: parseDateCell(get(iDateFilled)),
      }
    })
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
  /** Per-optional-tab fetch failure reason (tab not found, sheet not shared with that tab, API
   * error), keyed the same as DashboardData's optional fields — populated only when that specific
   * tab's fetch failed; a tab that fetched fine but genuinely has 0 data rows has no entry here.
   * Lets the admin page explain WHY a tab shows 0 rows instead of just showing 0. */
  tabErrors: Partial<Record<'pipeline' | 'internalMobility' | 'conversions' | 'notConverted' | 'vacancies', string>>
  /** Raw Hires!Offer Status/Offer Acceptance values that didn't match anything recognized — every
   * one of these rows got counted as Pending, which can silently zero out Total Offers Accepted
   * and everything derived from it (time to fill, cost of hire, acceptance rate) if the sheet
   * uses different wording. Empty outside a live connection. */
  unrecognizedOfferStatuses: { value: string; count: number }[]
  /** Count of Hires rows whose Resumption Date was before their Requisition Start Date (near-
   * certainly a typo'd year) and so had the resumption date dropped — see parseHiresRows. */
  suspiciousResumptionDates: number
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
    return { ...getSampleTaDashboardData(), connectionError: null, tabErrors: {}, unrecognizedOfferStatuses: [], suspiciousResumptionDates: 0 }
  }

  try {
    const spreadsheetId = process.env.TA_GOOGLE_SHEET_ID as string
    const accessToken = await getTaAccessToken()

    const tabErrors: TaDashboardResult['tabErrors'] = {}
    const optionalRange = (key: keyof TaDashboardResult['tabErrors'], range: string, label: string) =>
      fetchRange(spreadsheetId, range, accessToken).catch((err) => {
        const message = err instanceof Error ? err.message : `Unknown error reading "${label}".`
        console.warn(`[ta-sheets] No "${label}" tab found — that section will be empty.`, message)
        tabErrors[key] = message
        return [] as unknown[][]
      })

    const [hiresRows, configRows, pipelineRows, internalMobilityRows, conversionRows, notConvertedRows, vacancyRows] = await Promise.all([
      fetchRange(spreadsheetId, HIRES_RANGE, accessToken),
      fetchRange(spreadsheetId, CONFIG_RANGE, accessToken),
      optionalRange('pipeline', PIPELINE_RANGE, 'Pipeline'),
      optionalRange('internalMobility', INTERNAL_MOBILITY_RANGE, 'Internal Mobility'),
      optionalRange('conversions', CONVERSION_RANGE, 'Conversion'),
      optionalRange('notConverted', NOT_CONVERTED_RANGE, 'Not Converted'),
      optionalRange('vacancies', VACANCIES_RANGE, 'Vacancies'),
    ])

    const internalMobility = parseInternalMobilityRows(internalMobilityRows)
    const conversions = parseConversionRows(conversionRows)

    // parseConversionRows requires a valid Conversion Effective Date to build a record — a row
    // with that cell blank, or in a text format Date() can't parse (e.g. "06-10-2026", ambiguous
    // dash-separated), silently drops out. The sheet fetch itself succeeds in that case (no entry
    // in tabErrors), so without this check a sheet with real data rows but an unparseable date
    // column looks identical to a genuinely empty tab. (Internal Mobility has no equivalent check
    // — its Deployment Month is a free-text field, not a parsed date; see ta-types.ts.)
    const rawDataRowCount = (rows: unknown[][]) => Math.max(0, rows.filter((row) => row.some((cell) => cell != null && cell !== '')).length - 1)
    if (conversions.length === 0 && rawDataRowCount(conversionRows) > 0 && !tabErrors.conversions) {
      tabErrors.conversions = `Sheet has ${rawDataRowCount(conversionRows)} data row(s) but none parsed — every row needs a Conversion Effective Date value in a format JavaScript's Date can read (e.g. "2026-10-06" or "Oct 6, 2026").`
    }

    const { records, unrecognizedOfferStatuses, suspiciousResumptionDates } = parseHiresRows(hiresRows)

    return {
      records,
      config: parseConfigColumns(configRows),
      pipeline: parsePipelineRows(pipelineRows),
      internalMobility,
      conversions,
      notConverted: parseNotConvertedRows(notConvertedRows),
      vacancies: parseVacancyRows(vacancyRows),
      connectionError: null,
      tabErrors,
      unrecognizedOfferStatuses,
      suspiciousResumptionDates,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error connecting to the Talent Acquisition sheet.'
    console.error('[ta-sheets] Falling back to sample data after a connection error:', message)
    return { ...getSampleTaDashboardData(), connectionError: message, tabErrors: {}, unrecognizedOfferStatuses: [], suspiciousResumptionDates: 0 }
  }
}
