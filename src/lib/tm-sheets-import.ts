// One-time(ish) import: reads the Talent Management tabs from the L&D Google Sheet
// (GoogleSheetsConfig.spreadsheetUrl) and explodes them into the long-format tables
// (TalentMemberInfo, PromotionRecord, MobilityRecord, PerformanceAppraisalRecord,
// StrategicCommitteeRecord) — see prisma/schema.prisma for why long-format instead of the
// sheets' own wide year-column layout. Safe to re-run: TalentMemberInfo is upserted by Staff ID,
// and the four event tables are upserted by their natural key (staffId + year/period, or
// staffId + committee), so re-running after a sheet correction never duplicates rows — but it
// also never touches a record an admin has since corrected by hand through the Talent Management
// admin page, since re-import simply overwrites with whatever the sheet currently has for that
// same key. Run it again deliberately (not on a schedule) when the sheet changes.
import { prisma } from '@/lib/prisma'
import { connectToSpreadsheet } from '@/lib/google-sheets'
import { loadRosterDirectory, resolveStaff, resolveStaffLooseFuzzy, type ResolvedStaff } from '@/lib/staff-directory'
import { normalizeBUName } from '@/lib/bu-normalizer'

async function fetchRangeUnformatted(spreadsheetId: string, sheetName: string, accessToken: string): Promise<unknown[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (res.status === 404) throw new Error(`Tab "${sheetName}" not found in the spreadsheet.`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Could not read tab "${sheetName}" (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { values?: unknown[][] }
  return data.values ?? []
}

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

function parseScore(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  const n = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isNaN(n) ? null : n
}

function parseIntCell(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Math.trunc(value)
  const n = parseInt(String(value), 10)
  return Number.isNaN(n) ? null : n
}

function s(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function headerIndex(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  headerRow.forEach((h, i) => map.set(normalizeHeader(h), i))
  return map
}

// Staff ID is the reliable anchor on every sheet that has one — the Name column next to it is
// whatever the TM/L&D team happened to type (a nickname, an old surname, a different word order),
// which is exactly what was failing to resolve elsewhere. Prefer the Staff Roster's own canonical
// name for that ID; only fall back to the sheet's own text if the ID itself doesn't resolve.
function canonicalNameFor(staffId: string, sheetName: string | null, directory: Map<string, ResolvedStaff>): string | null {
  return resolveStaff(staffId, directory)?.name || sheetName
}

export interface TMImportSheetResult {
  sheet: string
  tabName: string | null
  imported: number
  skipped: number
  skippedDetails: { identifier: string; reason: string }[] // why each skipped row didn't count
  unresolved: { name: string; committee?: string }[] // names that couldn't be matched to the staff directory
  error: string | null
}

export interface TMImportResult {
  results: TMImportSheetResult[]
}

// Talent Members Info -> TalentMemberInfo. Upserted by Staff ID (created if new). A row with no
// Emp. ID at all is skipped — this table is the roster itself, so an unidentifiable row can't be
// usefully stored.
async function importTalentMembersInfo(spreadsheetId: string, sheetName: string, accessToken: string, directory: Map<string, ResolvedStaff>): Promise<TMImportSheetResult> {
  const rows = await fetchRangeUnformatted(spreadsheetId, sheetName, accessToken)
  if (rows.length === 0) return { sheet: 'Talent Members Info', tabName: sheetName, imported: 0, skipped: 0, skippedDetails: [], unresolved: [], error: null }
  const [header, ...body] = rows
  const idx = headerIndex(header)
  const col = (name: string) => idx.get(name)
  const iEmpId = col('emp. id') ?? col('emp id')
  const iName = col('name')
  const iBU = col('current bu')
  const iDojMeristem = col('doj meristem')
  const iDateJoinedTM = col('date of joining tm')
  const iRole = col('current role')
  const iGrade = col('current job grade')
  const iTier = col('current tier')
  const iGender = col('gender')
  const iStatus = col('status')

  let imported = 0
  let skipped = 0
  const skippedDetails: { identifier: string; reason: string }[] = []
  // Each row's find-then-create/update is independent of every other row, so they run
  // concurrently instead of one sequential round-trip at a time — with ~40+ rows at roughly 2 DB
  // calls each, sequential execution was most of what pushed this past Vercel's 60s limit.
  await Promise.all(body.map(async (row) => {
    const staffId = iEmpId != null ? s(row[iEmpId]) : ''
    if (!staffId) {
      skipped++
      skippedDetails.push({ identifier: (iName != null ? s(row[iName]) : '') || '(blank row)', reason: 'No Emp. ID in this row' })
      return
    }
    const sheetName_ = iName != null ? s(row[iName]) || null : null
    const data = {
      staffId,
      name: canonicalNameFor(staffId, sheetName_, directory),
      businessUnit: iBU != null && s(row[iBU]) ? normalizeBUName(s(row[iBU])) : null,
      dojMeristem: iDojMeristem != null ? parseDateCell(row[iDojMeristem]) : null,
      dateJoinedTM: iDateJoinedTM != null ? parseDateCell(row[iDateJoinedTM]) : null,
      currentRole: iRole != null ? s(row[iRole]) || null : null,
      currentGrade: iGrade != null ? s(row[iGrade]) || null : null,
      currentTier: iTier != null ? parseIntCell(row[iTier]) : null,
      gender: iGender != null ? s(row[iGender]) || null : null,
      status: iStatus != null && s(row[iStatus]).toLowerCase() === 'exited' ? 'Exited' : 'Active',
      // This row's data came FROM this same sheet, so it's already in sync with it by definition —
      // marking it synced here stops the old Talent Member Roster page's auto-retry (which treats
      // sheetSyncedAt: null as "needs pushing to the sheet") from immediately hammering the Sheets
      // API to re-write back the exact values it was just read from.
      sheetSyncedAt: new Date(),
      sheetSyncError: null,
    }
    const existing = await prisma.talentMemberInfo.findFirst({ where: { staffId } })
    if (existing) {
      await prisma.talentMemberInfo.update({ where: { id: existing.id }, data })
    } else {
      await prisma.talentMemberInfo.create({ data })
    }
    imported++
  }))
  return { sheet: 'Talent Members Info', tabName: sheetName, imported, skipped, skippedDetails, unresolved: [], error: null }
}

// TM Internal Mobility -> MobilityRecord. One row in -> up to 2 rows out (2025, 2026), each only
// created if that year's New BU/New Role cell has something in it. changeStatus is derived per
// year from whether those cells are filled, not parsed from the sheet's own combined
// "Changed 2025 Only"/"Changed Both Years" text, which describes both years at once.
async function importMobility(spreadsheetId: string, sheetName: string, accessToken: string, directory: Map<string, ResolvedStaff>): Promise<TMImportSheetResult> {
  const rows = await fetchRangeUnformatted(spreadsheetId, sheetName, accessToken)
  if (rows.length === 0) return { sheet: 'TM Internal Mobility', tabName: sheetName, imported: 0, skipped: 0, skippedDetails: [], unresolved: [], error: null }
  const [header, ...body] = rows
  const idx = headerIndex(header)
  const iEmpId = idx.get('emp. id') ?? idx.get('emp id')
  const iName = idx.get('name')
  const i2025BU = idx.get('2025 new bu')
  const i2025Role = idx.get('2025 new role')
  const i2026BU = idx.get('2026 new bu')
  const i2026Role = idx.get('2026 new role')
  const iEmpStatus = idx.get('employment status')

  let imported = 0
  let skipped = 0
  const skippedDetails: { identifier: string; reason: string }[] = []
  await Promise.all(body.map(async (row) => {
    const staffId = iEmpId != null ? s(row[iEmpId]) : ''
    if (!staffId) {
      skipped++
      skippedDetails.push({ identifier: (iName != null ? s(row[iName]) : '') || '(blank row)', reason: 'No Emp. ID in this row' })
      return
    }
    const name = canonicalNameFor(staffId, iName != null ? s(row[iName]) || null : null, directory)
    const employmentStatus = iEmpStatus != null && s(row[iEmpStatus]).toLowerCase() === 'exited' ? 'Exited' : 'Active'

    const years: { year: number; bu: string; role: string }[] = [
      { year: 2025, bu: i2025BU != null ? s(row[i2025BU]) : '', role: i2025Role != null ? s(row[i2025Role]) : '' },
      { year: 2026, bu: i2026BU != null ? s(row[i2026BU]) : '', role: i2026Role != null ? s(row[i2026Role]) : '' },
    ]
    // Every tracked person gets a record for both years, changed or not — the sheet itself covers
    // everyone (its own "Total Staff" count), so dropping the "No Change" rows during import was
    // why only 34 of 43 showed up instead of the full roster. Processed in year order (not
    // Promise.all, unlike the other importers) so 2026's previousBusinessUnit/previousRole can
    // chain from 2025's resolved values — 2025 itself has no earlier year to chain from, so its
    // previous fields stay null rather than guessed.
    let previousBU: string | null = null
    let previousRole: string | null = null
    for (const y of years) {
      const newBusinessUnit = y.bu ? normalizeBUName(y.bu) : null
      const newRole = y.role || null
      const changeStatus = (newBusinessUnit || newRole) ? 'Changed' : 'No Change'
      await prisma.mobilityRecord.upsert({
        where: { staffId_year: { staffId, year: y.year } },
        create: {
          staffId, name, year: y.year,
          previousBusinessUnit: previousBU, previousRole,
          newBusinessUnit, newRole,
          changeStatus, employmentStatus,
          sheetSyncedAt: new Date(), sheetSyncError: null,
        },
        update: {
          name, previousBusinessUnit: previousBU, previousRole,
          newBusinessUnit, newRole,
          changeStatus, employmentStatus,
          sheetSyncedAt: new Date(), sheetSyncError: null,
        },
      })
      imported++
      previousBU = newBusinessUnit ?? previousBU
      previousRole = newRole ?? previousRole
    }
  }))
  return { sheet: 'TM Internal Mobility', tabName: sheetName, imported, skipped, skippedDetails, unresolved: [], error: null }
}

// TM Promotion -> PromotionRecord. Scoped to 2025 and 2026 only — the sheet's 2023/2024 columns
// are positionally ambiguous about which "grade before promotion" column pairs with which year,
// and nothing on the dashboard needs anything before 2025 (Promotion Rate is explicitly scoped to
// "Promoted at least once (2025-2026)"), so guessing at 2023/2024 isn't worth the risk of storing
// wrong data. "Ever Promoted (2025-2026)" is the authoritative promoted flag for both years
// combined; 2025/2026 are also split out individually since the sheet has the detail.
async function importPromotions(spreadsheetId: string, sheetName: string, accessToken: string, directory: Map<string, ResolvedStaff>): Promise<TMImportSheetResult> {
  const rows = await fetchRangeUnformatted(spreadsheetId, sheetName, accessToken)
  if (rows.length === 0) return { sheet: 'TM Promotion', tabName: sheetName, imported: 0, skipped: 0, skippedDetails: [], unresolved: [], error: null }
  const [header, ...body] = rows
  const idx = headerIndex(header)
  const iEmpId = idx.get('emp. id') ?? idx.get('emp id')
  const iName = idx.get('name')
  const i2025Promo = idx.get('2025 promotion')
  const i2026Promo = idx.get('2026 promotion')
  // "Grade Before Promotion" sits immediately before the "2025 Promotion" column on the sheet —
  // paired with 2025's promotion, not 2024's.
  const iGradeBefore2025 = idx.get('grade before promotion')
  // The "New Grade" column immediately after "2025 Promotion" — there are 3 columns literally
  // named "New Grade" on this sheet, so the lookup above only ever finds the LAST one by header
  // name; use that column's position relative to i2025Promo to get the right one regardless.
  const iNewGrade2025 = i2025Promo != null ? i2025Promo + 1 : undefined

  let imported = 0
  let skipped = 0
  const skippedDetails: { identifier: string; reason: string }[] = []
  await Promise.all(body.map(async (row) => {
    const staffId = iEmpId != null ? s(row[iEmpId]) : ''
    if (!staffId) {
      skipped++
      skippedDetails.push({ identifier: (iName != null ? s(row[iName]) : '') || '(blank row)', reason: 'No Emp. ID in this row' })
      return
    }
    const name = canonicalNameFor(staffId, iName != null ? s(row[iName]) || null : null, directory)

    const writes: Promise<unknown>[] = []
    if (i2025Promo != null) {
      const promoted2025 = s(row[i2025Promo]).toLowerCase() === 'yes'
      writes.push(
        prisma.promotionRecord.upsert({
          where: { staffId_year: { staffId, year: 2025 } },
          create: {
            staffId, name, year: 2025, promoted: promoted2025,
            previousGrade: iGradeBefore2025 != null ? s(row[iGradeBefore2025]) || null : null,
            newGrade: promoted2025 && iNewGrade2025 != null ? s(row[iNewGrade2025]) || null : null,
          },
          update: {
            name, promoted: promoted2025,
            previousGrade: iGradeBefore2025 != null ? s(row[iGradeBefore2025]) || null : null,
            newGrade: promoted2025 && iNewGrade2025 != null ? s(row[iNewGrade2025]) || null : null,
          },
        }).then(() => { imported++ })
      )
    }
    if (i2026Promo != null) {
      const promoted2026 = s(row[i2026Promo]).toLowerCase() === 'yes'
      writes.push(
        prisma.promotionRecord.upsert({
          where: { staffId_year: { staffId, year: 2026 } },
          create: { staffId, name, year: 2026, promoted: promoted2026, previousGrade: null, newGrade: null },
          update: { name, promoted: promoted2026 },
        }).then(() => { imported++ })
      )
    }
    await Promise.all(writes)
  }))
  return { sheet: 'TM Promotion', tabName: sheetName, imported, skipped, skippedDetails, unresolved: [], error: null }
}

// TM Strategic Teams -> StrategicCommitteeRecord. No Emp. ID on this sheet — resolved against the
// staff directory by Name; unresolved names are reported back rather than silently dropped.
async function importStrategicTeams(spreadsheetId: string, sheetName: string, accessToken: string, directory: Map<string, ResolvedStaff>): Promise<TMImportSheetResult> {
  const rows = await fetchRangeUnformatted(spreadsheetId, sheetName, accessToken)
  if (rows.length === 0) return { sheet: 'TM Strategic Teams', tabName: sheetName, imported: 0, skipped: 0, skippedDetails: [], unresolved: [], error: null }
  const [header, ...body] = rows
  const idx = headerIndex(header)
  const iName = idx.get('name')
  const iCommittee = idx.get('strategic committee')

  let imported = 0
  let skipped = 0
  const skippedDetails: { identifier: string; reason: string }[] = []
  const unresolved: { name: string; committee?: string }[] = []

  // This table has no DB-level unique constraint to upsert against (a person can legitimately sit
  // on more than one committee, so staffId+committee isn't declared unique), so "does this row
  // already exist" is a manual findFirst-then-create, not an atomic upsert — running that fully
  // concurrently is a real race (two rows resolving to the same person+committee could both pass
  // the findFirst check before either create() lands, producing an exact duplicate — what had this
  // table at 65 rows for ~41 people). But running everything sequentially to avoid that pushed the
  // whole import over Vercel's time limit. This serializes only rows that target the SAME key
  // (staffId-or-name + committee) against each other, while different people's rows still run
  // concurrently — the race only existed between rows that could actually collide.
  const keyLocks = new Map<string, Promise<void>>()
  const withKeyLock = (key: string, fn: () => Promise<void>): Promise<void> => {
    const prev = keyLocks.get(key) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    keyLocks.set(key, next.catch(() => {}))
    return next
  }

  await Promise.all(body.map((row) => {
    const name = iName != null ? s(row[iName]) : ''
    const committee = iCommittee != null ? s(row[iCommittee]) : ''
    if (!name || !committee) {
      skipped++
      skippedDetails.push({ identifier: name || '(blank row)', reason: !name ? 'No Name in this row' : 'No Strategic Committee value' })
      return Promise.resolve()
    }
    // Resolved name is already canonical (comes straight from the matched directory record) —
    // this sheet has no Staff ID of its own to borrow from, so name-matching (with the comma-
    // reversal/middle-name fallbacks in resolveStaffLooseFuzzy) is still how this one resolves.
    const match = resolveStaffLooseFuzzy(name, directory)
    if (!match) unresolved.push({ name, committee })
    const staffId = match?.staffId ?? null
    const lockKey = `${staffId ?? name.trim().toLowerCase()}|${committee}`

    return withKeyLock(lockKey, async () => {
      const existing = staffId
        ? await prisma.strategicCommitteeRecord.findFirst({ where: { staffId, committee } })
        : await prisma.strategicCommitteeRecord.findFirst({ where: { staffId: null, name, committee } })
      if (existing) {
        await prisma.strategicCommitteeRecord.update({ where: { id: existing.id }, data: { staffId, name: match?.name || name, sheetSyncedAt: new Date(), sheetSyncError: null } })
      } else {
        await prisma.strategicCommitteeRecord.create({ data: { staffId, name: match?.name || name, committee, sheetSyncedAt: new Date(), sheetSyncError: null } })
      }
      imported++
    })
  }))
  return { sheet: 'TM Strategic Teams', tabName: sheetName, imported, skipped, skippedDetails, unresolved, error: null }
}

// TM Performance Appraisal -> PerformanceAppraisalRecord. One row in -> up to 3 rows out (H1 2025,
// H2 2025, H1 2026), one per non-blank score cell. Scores are stored exactly as the sheet has them
// (a 0-1 decimal) — the /5 conversion happens only at display time.
async function importPerformanceAppraisal(spreadsheetId: string, sheetName: string, accessToken: string, directory: Map<string, ResolvedStaff>): Promise<TMImportSheetResult> {
  const rows = await fetchRangeUnformatted(spreadsheetId, sheetName, accessToken)
  if (rows.length === 0) return { sheet: 'TM Performance Appraisal', tabName: sheetName, imported: 0, skipped: 0, skippedDetails: [], unresolved: [], error: null }
  const [header, ...body] = rows
  const idx = headerIndex(header)
  const iEmpId = idx.get('emp. id') ?? idx.get('emp id')
  const iName = idx.get('name')
  const periodCols: { period: string; idx: number | undefined }[] = [
    { period: 'H1 2025', idx: idx.get('h1 2025') },
    { period: 'H2 2025', idx: idx.get('h2 2025') },
    { period: 'H1 2026', idx: idx.get('h1 2026') },
  ]

  let imported = 0
  let skipped = 0
  const skippedDetails: { identifier: string; reason: string }[] = []
  await Promise.all(body.map(async (row) => {
    const staffId = iEmpId != null ? s(row[iEmpId]) : ''
    if (!staffId) {
      skipped++
      skippedDetails.push({ identifier: (iName != null ? s(row[iName]) : '') || '(blank row)', reason: 'No Emp. ID in this row' })
      return
    }
    const name = canonicalNameFor(staffId, iName != null ? s(row[iName]) || null : null, directory)
    await Promise.all(periodCols.map(async (p) => {
      if (p.idx == null) return
      const rawScore = parseScore(row[p.idx])
      if (rawScore == null) return
      // The sheet stores a 0-1 decimal (e.g. 0.78); the database stores 0-100 throughout, so this
      // is the one place the conversion happens on the way in — see mirrorPerformanceToSheet for
      // the matching /100 on the way back out.
      const score = rawScore * 100
      await prisma.performanceAppraisalRecord.upsert({
        where: { staffId_period: { staffId, period: p.period } },
        create: { staffId, name, period: p.period, score, sheetSyncedAt: new Date(), sheetSyncError: null },
        update: { name, score, sheetSyncedAt: new Date(), sheetSyncError: null },
      })
      imported++
    }))
  }))
  return { sheet: 'TM Performance Appraisal', tabName: sheetName, imported, skipped, skippedDetails, unresolved: [], error: null }
}

export async function importTMDataFromSheets(): Promise<TMImportResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl) {
    throw new Error('No spreadsheet configured under Admin -> Live Data Source.')
  }
  const connection = await connectToSpreadsheet(config.spreadsheetUrl)
  // Loaded once and passed to every importer — each one resolves its sheet's Staff ID against
  // this to pull the canonical name from the Staff Roster, instead of trusting whatever got typed
  // into the TM sheet's own Name column (a nickname, a different word order, an old surname).
  const directory = await loadRosterDirectory()

  const sheets: { label: string; tabName: string | null; run: (spreadsheetId: string, tabName: string, accessToken: string, directory: Map<string, ResolvedStaff>) => Promise<TMImportSheetResult> }[] = [
    { label: 'Talent Members Info', tabName: config.talentMemberSheetName, run: importTalentMembersInfo },
    { label: 'TM Internal Mobility', tabName: config.tmInternalMobilitySheetName, run: importMobility },
    { label: 'TM Promotion', tabName: config.tmPromotionSheetName, run: importPromotions },
    { label: 'TM Strategic Teams', tabName: config.tmStrategicTeamsSheetName, run: importStrategicTeams },
    { label: 'TM Performance Appraisal', tabName: config.tmPerformanceAppraisalSheetName, run: importPerformanceAppraisal },
  ]

  const results: TMImportSheetResult[] = []
  for (const sheet of sheets) {
    if (!sheet.tabName) {
      results.push({ sheet: sheet.label, tabName: null, imported: 0, skipped: 0, skippedDetails: [], unresolved: [], error: 'No tab name configured under Admin -> Live Data Source.' })
      continue
    }
    try {
      results.push(await sheet.run(connection.spreadsheetId, sheet.tabName, connection.accessToken, directory))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error.'
      results.push({ sheet: sheet.label, tabName: sheet.tabName, imported: 0, skipped: 0, skippedDetails: [], unresolved: [], error: message })
    }
  }
  return { results }
}
