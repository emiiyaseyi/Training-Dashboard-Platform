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
  isTalentMember: boolean
}

// "First Last" only, no middle name — used specifically for the Line Manager Name column written
// back to the comprehensive staff list sheet, per the admin's stated format for that column.
export function managerDisplayName(staff: ResolvedStaff): string {
  return [staff.firstName, staff.lastName].filter(Boolean).join(' ') || staff.name
}

// Reads the optional "comprehensive staff list" sheet (Admin -> Live Data Source) as a lenient
// supplement to the uploaded roster — only a Staff ID column is required, since this sheet's
// exact layout (e.g. a single "Name" column vs separate First/Last) isn't fixed yet and it isn't
// the primary source. Never throws; returns an empty list on any failure.
async function loadComprehensiveStaffList(): Promise<Map<string, ResolvedStaff>> {
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
      isTalentMember: findHeader(headers, ['istalentmember', 'talentmember', 'tm']),
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
        isTalentMember: col.isTalentMember ? /^y/i.test(norm(r[col.isTalentMember])) : false,
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
      isTalentMember: false, // not tracked on the uploaded roster — only the comprehensive staff list's "Is Talent Member" column carries this
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
        isTalentMember: existing.isTalentMember || extra.isTalentMember,
      })
    }
  }

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

export function resolveLineManager(staff: ResolvedStaff, directory: Map<string, ResolvedStaff>): ResolvedStaff | null {
  if (!staff.lineManagerStaffId) return null
  return directory.get(normalizeStaffIdKey(staff.lineManagerStaffId)) || null
}
