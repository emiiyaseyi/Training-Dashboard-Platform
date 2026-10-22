import { prisma } from './prisma'
import { normalizeStaffIdKey } from './staff-id'
import { loadRosterDirectory, type ResolvedStaff } from './staff-directory'

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
