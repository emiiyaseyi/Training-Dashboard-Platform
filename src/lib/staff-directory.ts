import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { connectToSpreadsheet, fetchSheetAsBuffer } from '@/lib/google-sheets'
import { findHeader } from '@/lib/excel-parser'
import { normalizeBUName } from '@/lib/bu-normalizer'

export interface ResolvedStaff {
  staffId: string
  name: string
  firstName: string
  lastName: string
  email: string | null
  lineManagerStaffId: string | null
  businessUnit: string
  // Deactivated (Employees page) staff still resolve here — this directory is also used for
  // historical lookups (an old training record's attendee shouldn't fail to resolve just because
  // they've since left) — but callers adding someone to something NEW (a training schedule, the
  // Talent Member roster) should check this and refuse if false. Comprehensive-list-only entries
  // (no matching roster record at all) default true — that sheet has no concept of deactivation.
  active: boolean
}

// "First Last" only, no middle name — used specifically for the Line Manager Name column written
// back to the comprehensive staff list sheet, per the admin's stated format for that column.
export function managerDisplayName(staff: ResolvedStaff): string {
  return [staff.firstName, staff.lastName].filter(Boolean).join(' ') || staff.name
}

// loadRosterDirectory() is called from a dozen+ places across the app (nearly every page/API
// that needs to resolve a staff member). Two things made it expensive on every single call: the
// comprehensive staff list supplement hit Google Sheets fresh (a live API round-trip plus a
// full-tab parse), and the base roster query scans StaffRosterRecord in full — a table that only
// ever grows (each re-upload adds new rows rather than replacing old ones; Admin → Staff Data
// Quality → Clean trims it, but only when run). Both are cached together here with a short TTL,
// long enough to collapse the many calls one user action (or one page's several API calls)
// triggers into a single fetch, short enough to still pick up an upload or sheet edit quickly.
const DIRECTORY_TTL_MS = 60_000
let directoryCache: { at: number; map: Map<string, ResolvedStaff> } | null = null
let comprehensiveListCache: { at: number; map: Map<string, ResolvedStaff> } | null = null

// Called after anything that changes what this cache would return (a roster upload/clean, the
// sheet config itself, or a direct write into the sheet like the Line Manager Name backfill) so
// the very next read reflects it immediately instead of waiting out the TTL.
export function invalidateComprehensiveStaffListCache(): void {
  comprehensiveListCache = null
  directoryCache = null
}

async function loadComprehensiveStaffList(): Promise<Map<string, ResolvedStaff>> {
  if (comprehensiveListCache && Date.now() - comprehensiveListCache.at < DIRECTORY_TTL_MS) {
    return comprehensiveListCache.map
  }
  const map = await fetchComprehensiveStaffList()
  comprehensiveListCache = { at: Date.now(), map }
  return map
}

// Reads the optional "comprehensive staff list" sheet (Admin -> Live Data Source) as a lenient
// supplement to the uploaded roster — only a Staff ID column is required, since this sheet's
// exact layout (e.g. a single "Name" column vs separate First/Last) isn't fixed yet and it isn't
// the primary source. Never throws; returns an empty list on any failure.
async function fetchComprehensiveStaffList(): Promise<Map<string, ResolvedStaff>> {
  const map = new Map<string, ResolvedStaff>()
  try {
    const config = await prisma.googleSheetsConfig.findFirst()
    if (!config?.spreadsheetUrl || !config.comprehensiveStaffListSheetName) return map

    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    const buffer = await fetchSheetAsBuffer(connection.spreadsheetId, config.comprehensiveStaffListSheetName, connection.accessToken)

    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (raw.length === 0) return map

    const headers = Object.keys(raw[0])
    const col = {
      staffId: findHeader(headers, ['staffid', 'staffno', 'employeeid', 'employeeno', 'id']),
      name: findHeader(headers, ['name', 'fullname', 'staffname', 'employeename']),
      firstName: findHeader(headers, ['firstname', 'first']),
      middleName: findHeader(headers, ['middlename', 'middle']),
      lastName: findHeader(headers, ['lastname', 'surname', 'last']),
      email: findHeader(headers, ['email', 'emailaddress', 'staffemail', 'workemail']),
      // "Cost Center" is confirmed to be this sheet's Business Unit column (being renamed to
      // "Business Unit" directly, but matched either way). Deliberately NOT matching "Department"
      // — that's a real, different column here, and guessing wrong would silently corrupt
      // BU-scoped data.
      bu: findHeader(headers, ['businessunit', 'businessunits', 'bu', 'costcenter']),
      lineManager: findHeader(headers, ['linemanagerstaffid', 'linemanagerid', 'reportsto', 'managerstaffid', 'manager', 'linemanager', 'supervisor']),
    }
    if (!col.staffId) return map // can't join to anything without a Staff ID column

    const norm = (v: unknown) => String(v ?? '').trim()

    for (const r of raw) {
      const staffId = norm(r[col.staffId])
      const key = normalizeStaffIdKey(staffId)
      if (!key) continue

      const firstName = col.firstName ? norm(r[col.firstName]) : ''
      const lastName = col.lastName ? norm(r[col.lastName]) : ''
      const name = col.name
        ? norm(r[col.name])
        : [firstName, col.middleName && norm(r[col.middleName]), lastName].filter(Boolean).join(' ')

      map.set(key, {
        staffId: staffId.toUpperCase(),
        name: name || staffId.toUpperCase(),
        firstName,
        lastName,
        email: col.email ? norm(r[col.email]).toLowerCase() || null : null,
        lineManagerStaffId: col.lineManager ? norm(r[col.lineManager]).toUpperCase() || null : null,
        businessUnit: col.bu ? normalizeBUName(norm(r[col.bu])) : '',
        active: true,
      })
    }
  } catch (err) {
    console.error('[staff-directory] comprehensive staff list read failed', err)
  }
  return map
}

// Roster uploads accumulate over time — always use each staffId's most recent record, same
// convention as roster-analytics.ts's Yet to Attend report. Keyed by normalized ID so lookups
// tolerate punctuation differences between source files (e.g. "MSL-0091" vs "MSL0091").
//
// Supplemented (not overridden) by the comprehensive staff list sheet, if configured: fills in
// gaps — a missing email, missing line manager, or a Staff ID not present in the uploaded roster
// at all — without replacing anything the roster already has, since that sheet isn't the primary
// source of truth yet.
export async function loadRosterDirectory(): Promise<Map<string, ResolvedStaff>> {
  if (directoryCache && Date.now() - directoryCache.at < DIRECTORY_TTL_MS) {
    return directoryCache.map
  }

  const all = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })
  const map = new Map<string, ResolvedStaff>()
  for (const r of all) {
    map.set(normalizeStaffIdKey(r.staffId), {
      staffId: r.staffId.toUpperCase(),
      name: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      lineManagerStaffId: r.lineManagerStaffId ? r.lineManagerStaffId.toUpperCase() : null,
      businessUnit: r.businessUnit,
      active: r.active,
    })
  }

  const comprehensive = await loadComprehensiveStaffList()
  for (const [key, extra] of comprehensive) {
    const existing = map.get(key)
    if (!existing) {
      map.set(key, extra)
    } else {
      map.set(key, {
        staffId: existing.staffId,
        name: existing.name || extra.name,
        firstName: existing.firstName || extra.firstName,
        lastName: existing.lastName || extra.lastName,
        email: existing.email || extra.email,
        lineManagerStaffId: existing.lineManagerStaffId || extra.lineManagerStaffId,
        businessUnit: existing.businessUnit || extra.businessUnit,
        active: existing.active,
      })
    }
  }

  directoryCache = { at: Date.now(), map }
  return map
}

// Accepts either a Staff ID (any punctuation) or an email address.
export function resolveStaff(identifier: string, directory: Map<string, ResolvedStaff>): ResolvedStaff | null {
  const trimmed = identifier.trim()
  if (!trimmed) return null
  const byId = directory.get(normalizeStaffIdKey(trimmed))
  if (byId) return byId
  const lower = trimmed.toLowerCase()
  for (const staff of directory.values()) {
    if (staff.email?.toLowerCase() === lower) return staff
  }
  return null
}

// Like resolveStaff, but also falls back to an exact (case-insensitive) name match — used where
// the admin enters a bare identifier that could be a Staff ID, email, or full name (Talent Member
// roster entries, TM exemptions), rather than a form field that's known to be one or the other.
export function resolveStaffLoose(identifier: string, directory: Map<string, ResolvedStaff>): ResolvedStaff | null {
  const byIdOrEmail = resolveStaff(identifier, directory)
  if (byIdOrEmail) return byIdOrEmail
  const lower = identifier.trim().toLowerCase()
  if (!lower) return null
  for (const staff of directory.values()) {
    if (staff.name.toLowerCase() === lower) return staff
  }
  return null
}

export function resolveLineManager(staff: ResolvedStaff, directory: Map<string, ResolvedStaff>): ResolvedStaff | null {
  if (!staff.lineManagerStaffId) return null
  return directory.get(normalizeStaffIdKey(staff.lineManagerStaffId)) || null
}
