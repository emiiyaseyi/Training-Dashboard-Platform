import { prisma } from '@/lib/prisma'
import { normalizeStaffIdKey } from '@/lib/staff-id'

export interface ResolvedStaff {
  staffId: string
  name: string
  email: string | null
  lineManagerStaffId: string | null
  businessUnit: string
}

// Roster uploads accumulate over time — always use each staffId's most recent record, same
// convention as roster-analytics.ts's Yet to Attend report. Keyed by normalized ID so lookups
// tolerate punctuation differences between source files (e.g. "MSL-0091" vs "MSL0091").
export async function loadRosterDirectory(): Promise<Map<string, ResolvedStaff>> {
  const all = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })
  const map = new Map<string, ResolvedStaff>()
  for (const r of all) {
    map.set(normalizeStaffIdKey(r.staffId), {
      staffId: r.staffId.toUpperCase(),
      name: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
      email: r.email,
      lineManagerStaffId: r.lineManagerStaffId ? r.lineManagerStaffId.toUpperCase() : null,
      businessUnit: r.businessUnit,
    })
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
