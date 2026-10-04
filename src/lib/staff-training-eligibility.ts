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
  return role.includes('meri mover') || role.includes('merimover')
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
