import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { connectToSpreadsheet, fetchSheetAsBuffer } from '@/lib/google-sheets'
import { findHeader } from '@/lib/excel-parser'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { buildFullName } from '@/lib/staff-name'

export interface ResolvedStaff {
  staffId: string
  name: string
  firstName: string
  lastName: string
  email: string | null
  lineManagerStaffId: string | null
  businessUnit: string
  role: string | null
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
      role: findHeader(headers, ['role', 'jobtitle', 'position', 'designation']),
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
        : buildFullName(firstName, col.middleName ? norm(r[col.middleName]) : '', lastName)

      map.set(key, {
        staffId: staffId.toUpperCase(),
        name: name || staffId.toUpperCase(),
        firstName,
        lastName,
        email: col.email ? norm(r[col.email]).toLowerCase() || null : null,
        lineManagerStaffId: col.lineManager ? norm(r[col.lineManager]).toUpperCase() || null : null,
        businessUnit: col.bu ? normalizeBUName(norm(r[col.bu])) : '',
        role: col.role ? norm(r[col.role]) || null : null,
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
      name: buildFullName(r.firstName, r.middleName, r.lastName),
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      lineManagerStaffId: r.lineManagerStaffId ? r.lineManagerStaffId.toUpperCase() : null,
      businessUnit: r.businessUnit,
      role: r.role,
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
        role: existing.role || extra.role,
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

// A name-matching key, not for display — some rosters were originally uploaded from a single
// "First - Last" formatted column, and depending on how that got split, the literal " - " (or
// "-") sometimes ended up baked into firstName/lastName itself (e.g. a stored name of
// "Onyekachi - Duru", not just "Onyekachi Duru"). An admin typing a name into the Talent Member
// roster, an exemption, or any other free-text name field naturally leaves the dash out, so an
// exact-string match silently fails even though it's obviously the same person. Strips
// hyphens/dashes used as word separators and collapses whitespace before comparing.
function normalizeNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-‐-―]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// First and last whitespace-separated tokens only, tolerating a present/absent middle name on
// either side — "Damilola Hassan" vs. a roster record stored as "Damilola Ovie Hassan" are
// obviously the same person, but neither the exact nor normalizeNameKey comparison above will
// ever say so.
function firstLastTokenKey(name: string): string {
  const tokens = normalizeNameKey(name).split(' ').filter(Boolean)
  if (tokens.length < 2) return normalizeNameKey(name)
  return `${tokens[0]} ${tokens[tokens.length - 1]}`
}

// Like resolveStaff, but also falls back to a name match — used where the admin enters a bare
// identifier that could be a Staff ID, email, or full name (Talent Member roster entries, TM
// exemptions), rather than a form field that's known to be one or the other. Tries, in order: an
// exact (case-insensitive) match, a dash/whitespace-normalized one (normalizeNameKey), "Lastname,
// Firstname" un-reversed (common in sheets exported/sorted by surname), then first+last token
// only (tolerating a middle name present on one side but not the other).
export function resolveStaffLoose(identifier: string, directory: Map<string, ResolvedStaff>): ResolvedStaff | null {
  const byIdOrEmail = resolveStaff(identifier, directory)
  if (byIdOrEmail) return byIdOrEmail
  const lower = identifier.trim().toLowerCase()
  if (!lower) return null
  for (const staff of directory.values()) {
    if (staff.name.toLowerCase() === lower) return staff
  }
  const normalizedQuery = normalizeNameKey(identifier)
  if (!normalizedQuery) return null
  for (const staff of directory.values()) {
    if (normalizeNameKey(staff.name) === normalizedQuery) return staff
  }
  if (identifier.includes(',')) {
    const [last, first] = identifier.split(',', 2).map((p) => p.trim())
    if (last && first) {
      const reversed = normalizeNameKey(`${first} ${last}`)
      for (const staff of directory.values()) {
        if (normalizeNameKey(staff.name) === reversed) return staff
      }
    }
  }
  return null
}

// Looser than resolveStaffLoose: also matches on first+last token only, tolerating a middle name
// present on one side but not the other (see firstLastTokenKey). Deliberately NOT folded into
// resolveStaffLoose itself, which is used all over the app (survey attendee matching, training
// records, etc.) where collapsing two different people who share a first+last name into one would
// be a real, silent harm (crediting/surveying the wrong person). This fuzzier match is only safe
// where a human reviews "resolved" vs. "not resolved" before anything is acted on — currently just
// the Talent Member roster and the TM sheet import's Strategic Teams resolution.
export function resolveStaffLooseFuzzy(identifier: string, directory: Map<string, ResolvedStaff>): ResolvedStaff | null {
  const exact = resolveStaffLoose(identifier, directory)
  if (exact) return exact
  const queryTokenKey = firstLastTokenKey(identifier.includes(',') ? identifier.split(',').reverse().join(' ') : identifier)
  if (!queryTokenKey) return null
  for (const staff of directory.values()) {
    if (firstLastTokenKey(staff.name) === queryTokenKey) return staff
  }
  return null
}

// Tries Staff ID, Name, and Email as INDEPENDENT attempts (not "pick whichever one is set and
// hope it works") — a roster entry that has a Staff ID recorded doesn't necessarily mean that ID
// is still correct (stale, typo'd, or just formatted differently from the Staff Roster upload);
// `e.staffId || e.name || e.email` silently gives up the moment a present-but-wrong Staff ID
// fails to match, never falling back to the Name that would have resolved fine. This is what TM
// roster entries (and TM exemptions) should always use instead of that short-circuit chain.
export function resolveStaffLooseAny(
  e: { staffId?: string | null; name?: string | null; email?: string | null },
  directory: Map<string, ResolvedStaff>
): ResolvedStaff | null {
  if (e.staffId) {
    const match = resolveStaffLoose(e.staffId, directory)
    if (match) return match
  }
  if (e.name) {
    const match = resolveStaffLooseFuzzy(e.name, directory)
    if (match) return match
  }
  if (e.email) {
    const match = resolveStaffLoose(e.email, directory)
    if (match) return match
  }
  return null
}

export function resolveLineManager(staff: ResolvedStaff, directory: Map<string, ResolvedStaff>): ResolvedStaff | null {
  if (!staff.lineManagerStaffId) return null
  return directory.get(normalizeStaffIdKey(staff.lineManagerStaffId)) || null
}

// The single source of truth for "what should this attendee's name/email/manager fields be right
// now, according to the current roster". Used both by the on-demand admin refresh AND,
// critically, by survey-send.ts right before every stage/reminder email goes out — a
// TrainingScheduleAttendee row snapshots name/email/manager at add-time so a send stays correct
// even if the roster later goes stale or unavailable, but that also means an Employee record
// edited afterward (email added, Line Manager changed) never reaches an already-scheduled,
// not-yet-sent survey without this. Returns null if the staffId no longer resolves at all (roster
// removed them) so the caller can leave the existing cached values alone rather than blanking
// them out.
export function resolveCurrentAttendeeFields(
  staffId: string,
  directory: Map<string, ResolvedStaff>
): { staffName: string; email: string | null; lineManagerName: string | null; lineManagerEmail: string | null } | null {
  const staff = resolveStaff(staffId, directory)
  if (!staff) return null
  const manager = resolveLineManager(staff, directory)
  return {
    staffName: staff.name,
    email: staff.email,
    lineManagerName: manager?.name || null,
    lineManagerEmail: manager?.email || null,
  }
}
