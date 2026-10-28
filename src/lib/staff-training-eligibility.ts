import type { StaffRosterRecord } from '@prisma/client'
import type { PeriodFilter } from './filter-types'

// Shared "who counts toward training coverage" rule, used by BOTH Executive Overview/BU reports
// (analytics.ts) and Yet to Attend Training (roster-analytics.ts) — previously each file had its
// own independently-written version of this logic, which had already drifted out of sync (Yet to
// Attend was missing the Meri Mover exclusion). One shared definition means both pages report the
// same numbers for the same underlying question, by construction, not by coincidence.
//
// Excluded from the coverage-eligible pool: not active, not confirmed, Meri Mover (a driver/
// messenger role never enrolled in formal training), Intern/NYSC/Graduate Intern (via Employment
// Type or job-title text — Employment Type is rarely populated since it's set manually per-person
// on the Employees page, not part of the Excel/Sheets import), and — when a specific year is being
// viewed — anyone hired in July-December of that same year (no fair shot at that year's cycle
// yet). "All Time" skips that last check since it doesn't apply across multiple years.

export function isMeriMover(staff: Pick<StaffRosterRecord, 'role'>): boolean {
  const role = (staff.role || '').trim().toLowerCase()
  // Broad on purpose — any job title containing "mover" (Meri Mover, Senior Meri Mover, Mover,
  // etc.) is this role, per explicit instruction after a variant title slipped through the
  // earlier exact "meri mover"/"merimover" match.
  return role.includes('mover')
}

export function isInternLike(staff: Pick<StaffRosterRecord, 'employmentType' | 'role'>): boolean {
  const empType = (staff.employmentType || '').trim().toLowerCase()
  const role = (staff.role || '').trim().toLowerCase()
  return empType.includes('intern') || empType.includes('nysc') || role.includes('intern')
}

export function isEligibleForTrainingCoverage(
  staff: Pick<StaffRosterRecord, 'active' | 'confirmed' | 'employmentType' | 'role' | 'employmentDate'>,
  effectiveYear: number | null,
): boolean {
  if (!staff.active || !staff.confirmed) return false
  if (isInternLike(staff)) return false
  if (isMeriMover(staff)) return false
  if (effectiveYear != null && staff.employmentDate) {
    const d = staff.employmentDate
    if (d.getUTCFullYear() === effectiveYear && d.getUTCMonth() >= 6) return false // Jul–Dec
  }
  return true
}

export function countEligibleStaff(
  roster: Pick<StaffRosterRecord, 'active' | 'confirmed' | 'employmentType' | 'role' | 'employmentDate' | 'businessUnit'>[],
  businessUnit: string | null,
  effectiveYear: number | null,
): number {
  return roster.filter(
    (s) => (businessUnit == null || s.businessUnit.toLowerCase() === businessUnit.toLowerCase())
      && isEligibleForTrainingCoverage(s, effectiveYear)
  ).length
}

// "All Time" has no single year to evaluate an H2-hire cutoff against, so that part of
// eligibility is skipped for it — a person hired H2 2024 has since had full years (2025, 2026…)
// to be trained, so excluding them from an all-time total would be wrong.
export function effectiveYearForCoverage(filter: PeriodFilter): number | null {
  return filter.mode === 'all' ? null : (filter.year ?? new Date().getFullYear())
}

// StaffRosterRecord is a snapshot LOG, not one row per person — every sync/upload that touches
// someone adds another row rather than updating in place (see sheets-sync.ts's dedupeRoster).
// Reading it for a coverage count without collapsing to "most recent row per Staff ID" silently
// counts the same person multiple times, once per historical snapshot — this is what every other
// consumer of this table (Yet to Attend, the Employees page) already does; analytics.ts didn't,
// which is why Executive Overview's total was inflated relative to Yet to Attend's.
export function latestRosterSnapshot<T extends { staffId: string; createdAt: Date }>(roster: T[]): T[] {
  // Sorted internally (ascending) rather than trusting the caller's query order — a Map keeps
  // whichever value was set last for a given key, so ascending order makes "last write wins"
  // mean "most recent snapshot wins," regardless of how the caller fetched the rows.
  const sorted = [...roster].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const latestByStaffId = new Map<string, T>()
  for (const r of sorted) latestByStaffId.set(r.staffId, r)
  return [...latestByStaffId.values()]
}

// Yet to Attend Training's own pool — wider than the coverage rule above on purpose: everyone
// except Meri Movers who was on the books at some point during the period viewed, whether or not
// they're confirmed, an intern, or a late-in-the-year hire. "On the books" means hired on/before
// the period's end and not exited before its start (exit = StaffRosterRecord.endDate). An "All
// Time" view (no bounds) is just the people currently active.
export interface PeriodBounds { start: Date | null; end: Date | null }

export function periodBoundsForFilter(filter: PeriodFilter, monthIndex: (m: string) => number, now = new Date()): PeriodBounds {
  const year = filter.year ?? now.getUTCFullYear()
  if (filter.mode === 'all') return { start: null, end: null }
  if (filter.mode === 'year') return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) }
  if (filter.mode === 'ytd') return { start: new Date(Date.UTC(year, 0, 1)), end: now }
  if (filter.mode === 'range' && filter.fromMonth && filter.toMonth) {
    const a = monthIndex(filter.fromMonth)
    const b = monthIndex(filter.toMonth)
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    return { start: new Date(Date.UTC(year, lo, 1)), end: new Date(Date.UTC(year, hi + 1, 0, 23, 59, 59)) }
  }
  return { start: null, end: null }
}

export function isInYetToAttendPool(
  staff: Pick<StaffRosterRecord, 'active' | 'role' | 'employmentDate' | 'endDate'>,
  bounds: PeriodBounds,
): boolean {
  if (isMeriMover(staff)) return false
  if (bounds.end && staff.employmentDate && staff.employmentDate > bounds.end) return false // joined after the period
  if (staff.active) return true
  // Exited: only counts if they were still here at some point in the period. No recorded exit date
  // means we can't say when they left, so they're left out rather than guessed at.
  if (!bounds.start || !staff.endDate) return false
  return staff.endDate >= bounds.start
}
