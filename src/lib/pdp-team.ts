import { prisma } from './prisma'
import { normalizeStaffIdKey } from './staff-id'
import { loadRosterDirectory, resolveStaffLoose, type ResolvedStaff } from './staff-directory'

export interface PDPAudience {
  type: 'all' | 'businessUnit' | 'department' | 'selected'
  value?: string | string[] | null // BU/department name for those two types, Staff ID list for 'selected'
}

// Shared audience filter for both PDP launch tracks — same audienceType vocabulary as Custom
// Survey's resolveAudience (custom-survey.ts), reused here for consistency rather than inventing
// a second convention. `department` isn't on ResolvedStaff (loadRosterDirectory's shape), so this
// reads StaffRosterRecord directly for that one case, same latest-row-per-staffId pattern used
// throughout this codebase.
export async function filterStaffByAudience(staff: ResolvedStaff[], audience: PDPAudience): Promise<ResolvedStaff[]> {
  if (!audience || audience.type === 'all') return staff
  if (audience.type === 'businessUnit') {
    const bu = String(audience.value || '')
    return staff.filter((s) => s.businessUnit === bu)
  }
  if (audience.type === 'selected') {
    const identifiers = Array.isArray(audience.value) ? audience.value : []
    const directory = await loadRosterDirectory()
    const resolved = identifiers.map((id) => resolveStaffLoose(id, directory)).filter((s): s is ResolvedStaff => !!s)
    const keys = new Set(resolved.map((s) => normalizeStaffIdKey(s.staffId)))
    return staff.filter((s) => keys.has(normalizeStaffIdKey(s.staffId)))
  }
  if (audience.type === 'department') {
    const dept = String(audience.value || '').trim().toLowerCase()
    const roster = await prisma.staffRosterRecord.findMany({ select: { staffId: true, department: true }, orderBy: { createdAt: 'asc' } })
    const deptByStaffId = new Map<string, string>()
    for (const r of roster) deptByStaffId.set(normalizeStaffIdKey(r.staffId), (r.department || '').trim().toLowerCase())
    return staff.filter((s) => deptByStaffId.get(normalizeStaffIdKey(s.staffId)) === dept)
  }
  return staff
}

// "Manager -> list of reports" does not exist anywhere else in this codebase (every other place
// only resolves the other direction, staff -> their own manager — see resolveLineManager in
// staff-directory.ts). Built fresh here for PDP rather than added to staff-directory.ts itself,
// since the second-manager override below is a PDP-specific concept, not a roster-wide one.
export async function getTeamMembersForManager(cycleId: string, managerStaffId: string): Promise<ResolvedStaff[]> {
  const managerKey = normalizeStaffIdKey(managerStaffId)
  const directory = await loadRosterDirectory()

  const direct = [...directory.values()].filter(
    (s) => s.active && s.lineManagerStaffId && normalizeStaffIdKey(s.lineManagerStaffId) === managerKey
  )

  const overrides = await prisma.pDPManagerOverride.findMany({ where: { cycleId, secondManagerStaffId: managerStaffId.toUpperCase() } })
  const viaOverride = overrides
    .map((o) => directory.get(normalizeStaffIdKey(o.staffId)))
    .filter((s): s is ResolvedStaff => !!s && s.active)

  const byStaffId = new Map<string, ResolvedStaff>()
  for (const s of [...direct, ...viaOverride]) byStaffId.set(normalizeStaffIdKey(s.staffId), s)
  return [...byStaffId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// Every distinct manager Track B needs to reach — anyone who is someone's lineManagerStaffId, or
// a secondManagerStaffId on a PDPManagerOverride for this cycle, resolved against the roster
// directory (so a manager who isn't themselves an active roster entry is still reachable — their
// email/name just won't resolve, which the caller should skip and report rather than guess at).
export async function getAllManagerStaffIds(cycleId: string): Promise<string[]> {
  const directory = await loadRosterDirectory()
  const ids = new Set<string>()
  for (const s of directory.values()) {
    if (s.active && s.lineManagerStaffId) ids.add(normalizeStaffIdKey(s.lineManagerStaffId))
  }
  const overrides = await prisma.pDPManagerOverride.findMany({ where: { cycleId } })
  for (const o of overrides) ids.add(normalizeStaffIdKey(o.secondManagerStaffId))
  return [...ids]
}
