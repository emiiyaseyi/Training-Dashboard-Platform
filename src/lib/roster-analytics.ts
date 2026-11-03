import { prisma } from '@/lib/prisma'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { buildFullName } from '@/lib/staff-name'
import { isInYetToAttendPool, periodBoundsForFilter, isInternLike, isMeriMover } from '@/lib/staff-training-eligibility'

// Kept intentionally separate from analytics.ts in its attendance logic — this report reads
// TrainingRecord (and, for the same reason Talent Members unions two sources — see
// computeTalentMemberReport — TrainingSchedule) for attendance but never writes back to either,
// and touches no other report's calculations. Who COUNTS toward coverage, though, is shared with
// analytics.ts via staff-training-eligibility.ts, so both pages report the same pool for the same
// underlying question.

function allowedMonths(filter: PeriodFilter): Set<string> | null {
  if (filter.mode === 'all' || filter.mode === 'year') return null
  const now = new Date()
  let indices: number[] = []
  if (filter.mode === 'ytd') {
    indices = Array.from({ length: now.getMonth() + 1 }, (_, i) => i)
  } else if (filter.mode === 'range' && filter.fromMonth && filter.toMonth) {
    const from = MONTHS.indexOf(filter.fromMonth as (typeof MONTHS)[number])
    const to = MONTHS.indexOf(filter.toMonth as (typeof MONTHS)[number])
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) indices.push(i)
  }
  return new Set(indices.map((i) => MONTHS[i]))
}

export interface YetToAttendStaff {
  staffId: string
  staffName: string
  businessUnit: string
  role: string | null
  department: string | null
  employmentDate: string | null
}

function fullName(r: { firstName: string; middleName: string | null; lastName: string }): string {
  return buildFullName(r.firstName, r.middleName, r.lastName)
}

export interface JoinPeriodBreakdown {
  key: string // sortable, e.g. "2026-03" or "2026-Q1"
  label: string // display, e.g. "March 2026" or "Q1 2026"
  count: number
}

export interface BUAttendanceBreakdown {
  businessUnit: string
  totalConfirmed: number
  attended: number
  upcoming: number
  yetToAttend: number
  coverageRatio: number
}

export interface YetToAttendReport {
  totalConfirmedStaff: number
  totalAttended: number
  totalUpcoming: number
  totalYetToAttend: number
  overallCoverageRatio: number
  byBU: BUAttendanceBreakdown[]
  list: YetToAttendStaff[]
  // When the "yet to attend" staff joined — grouped by calendar month and by quarter, sorted
  // chronologically, so L&D can see whether gaps cluster around particular hiring waves (e.g. a
  // big onboarding cohort that hasn't yet gotten training). Staff with no Employment Date on file
  // aren't included in either breakdown (nothing to group them by) — same silent-skip convention
  // used everywhere else in this report for missing-data staff.
  byJoinMonth: JoinPeriodBreakdown[]
  byJoinQuarter: JoinPeriodBreakdown[]
  hasRosterData: boolean
  availableYears: number[]
  // Roster composition context, independent of attendance — surfaced as their own cards rather
  // than folded into the confirmed-staff coverage numbers above.
  unconfirmedStaffCount: number
  internStaffCount: number
  meriMoverStaffCount: number
}

export async function computeYetToAttend(filter: PeriodFilter, buScope?: string[] | null): Promise<YetToAttendReport> {
  const [allRoster, allTraining, allSchedules] = await Promise.all([
    prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.trainingRecord.findMany({ select: { id: true, staffId: true, year: true, month: true } }),
    // Schedule-sourced attendance is unioned in alongside TrainingRecord for the same reason
    // computeTalentMemberReport does: a schedule's attendees are dual-written into TrainingRecord
    // the moment they're added (see training-schedule/[id]/attendees/route.ts), but older
    // schedules created before that existed, or any row where that write failed, would otherwise
    // silently look like "never attended" here even though the schedule clearly happened.
    // Fetched unfiltered (not just past) so upcoming attendees can be identified separately below —
    // people with something scheduled shouldn't show as "yet to attend" either.
    prisma.trainingSchedule.findMany({
      select: { startDate: true, endDate: true, attendees: { select: { staffId: true, linkedTrainingRecordId: true } } },
    }),
  ])

  const availableYears = [...new Set(allTraining.map((r) => r.year))].sort((a, b) => b - a)

  const now = Date.now()
  // Split on START date, not end date — same reasoning as computeTalentMemberReport: once a
  // training has begun it counts toward attendance and drops out of "upcoming", rather than
  // sitting in both simultaneously until it finishes.
  const pastSchedules = allSchedules.filter((s) => s.startDate.getTime() < now)
  const upcomingSchedules = allSchedules.filter((s) => s.startDate.getTime() >= now)

  // Every schedule attendee gets a TrainingRecord auto-written and linked back via
  // linkedTrainingRecordId the moment they're added (see attendees/route.ts) — purely so Manage
  // Records shows them immediately, not a second, independent attendance event. Excluded from the
  // record-path here so that person is represented exactly once: via the schedule (accurate dates,
  // correctly deferred to "upcoming" until it actually happens) rather than also via this
  // month-only TrainingRecord, which would otherwise mark them "attended" before the training
  // even happens (a schedule-linked record has no day precision, only the schedule's start month).
  const linkedRecordIds = new Set(allSchedules.flatMap((s) => s.attendees.map((a) => a.linkedTrainingRecordId).filter((id): id is string => !!id)))

  // Roster is a snapshot, not a cumulative log — dedupe by staffId, most recent upload wins.
  const latestByStaffId = new Map<string, (typeof allRoster)[number]>()
  for (const r of allRoster) latestByStaffId.set(r.staffId, r)
  const latestRoster = [...latestByStaffId.values()]

  // "Confirmed Staff" (the main coverage pool below) uses the exact same eligibility rule as
  // Executive Overview's Total Staff Coverage — active, confirmed, not an Intern/NYSC/Graduate
  // Intern, not a Meri Mover (driver/messenger role never enrolled in formal training) — so the
  // two pages report consistent numbers for the same underlying question. Interns and Meri
  // Movers get their own informational cards below instead, counted from the active roster
  // regardless of confirmation status, since "how many Meri Movers do we have" doesn't depend on
  // whether they happen to be confirmed.
  // Pool = everyone currently active except Meri Movers (confirmed or not, interns and late-year
  // hires included; exited staff are excluded entirely — see isInYetToAttendPool).
  const bounds = periodBoundsForFilter(filter, (m) => MONTHS.indexOf(m as (typeof MONTHS)[number]))

  let roster = latestRoster.filter((r) => isInYetToAttendPool(r, bounds))
  if (buScope) roster = roster.filter((r) => buScope.includes(r.businessUnit))

  let scopedRoster = latestRoster.filter((r) => r.active)
  if (buScope) scopedRoster = scopedRoster.filter((r) => buScope.includes(r.businessUnit))
  const unconfirmedStaffCount = scopedRoster.filter((r) => !r.confirmed).length
  const internStaffCount = scopedRoster.filter(isInternLike).length
  const meriMoverStaffCount = scopedRoster.filter(isMeriMover).length

  const inPeriod = (year: number, month: string) => {
    if (filter.mode !== 'all' && filter.year && year !== filter.year) return false
    const months = allowedMonths(filter)
    if (months && !months.has(month)) return false
    return true
  }

  let training = allTraining.filter((r) => !linkedRecordIds.has(r.id))
  if (filter.mode !== 'all' && filter.year) {
    training = training.filter((r) => r.year === filter.year)
  }
  const months = allowedMonths(filter)
  if (months) {
    training = training.filter((r) => months.has(r.month))
  }
  const attendedStaffIds = new Set(training.map((r) => normalizeStaffIdKey(r.staffId)))

  for (const sched of pastSchedules) {
    if (!inPeriod(sched.startDate.getFullYear(), MONTHS[sched.startDate.getMonth()])) continue
    for (const att of sched.attendees) attendedStaffIds.add(normalizeStaffIdKey(att.staffId))
  }

  // Not period-filtered — forward-looking by definition, same convention as
  // computeTalentMemberReport's "upcoming" (a Year-to-Date filter shouldn't hide something
  // scheduled later in the year).
  const upcomingStaffIds = new Set<string>()
  for (const sched of upcomingSchedules) {
    for (const att of sched.attendees) upcomingStaffIds.add(normalizeStaffIdKey(att.staffId))
  }

  const list: YetToAttendStaff[] = []
  let totalAttended = 0
  let totalUpcoming = 0
  const buMap = new Map<string, { totalConfirmed: number; attended: number; upcoming: number }>()

  for (const staff of roster) {
    const key = normalizeStaffIdKey(staff.staffId)
    const attended = attendedStaffIds.has(key)
    const upcoming = !attended && upcomingStaffIds.has(key)
    if (attended) totalAttended++
    if (upcoming) totalUpcoming++

    const bu = buMap.get(staff.businessUnit) || { totalConfirmed: 0, attended: 0, upcoming: 0 }
    bu.totalConfirmed++
    if (attended) bu.attended++
    if (upcoming) bu.upcoming++
    buMap.set(staff.businessUnit, bu)

    // Someone with a not-yet-happened training already scheduled isn't "yet to attend" in the
    // sense this list means (nothing lined up for them) — they're just not showing here yet.
    if (!attended && !upcoming) {
      list.push({
        staffId: staff.staffId,
        staffName: fullName(staff),
        businessUnit: staff.businessUnit,
        role: staff.role,
        department: staff.department,
        employmentDate: staff.employmentDate ? staff.employmentDate.toISOString() : null,
      })
    }
  }

  // Always the current calendar year, regardless of the page's own period filter — this
  // breakdown answers "of this year's yet-to-attend cohort, when did they join," not "of
  // whichever period is selected." Pre-seeded with every month/quarter of the year (in order)
  // so the chart always reads Jan→Dec / Q1→Q4 even when some months have zero joiners.
  const currentYear = new Date().getFullYear()
  const monthMap = new Map<string, JoinPeriodBreakdown>()
  const quarterMap = new Map<string, JoinPeriodBreakdown>()
  for (let m = 0; m < 12; m++) {
    const monthKey = `${currentYear}-${String(m + 1).padStart(2, '0')}`
    monthMap.set(monthKey, { key: monthKey, label: `${MONTHS[m]} ${currentYear}`, count: 0 })
  }
  for (let q = 1; q <= 4; q++) {
    const quarterKey = `${currentYear}-Q${q}`
    quarterMap.set(quarterKey, { key: quarterKey, label: `Q${q} ${currentYear}`, count: 0 })
  }
  for (const s of list) {
    if (!s.employmentDate) continue
    const d = new Date(s.employmentDate)
    const year = d.getFullYear()
    if (year !== currentYear) continue
    const monthIdx = d.getMonth()

    const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
    monthMap.get(monthKey)!.count++

    const quarter = Math.floor(monthIdx / 3) + 1
    const quarterKey = `${year}-Q${quarter}`
    quarterMap.get(quarterKey)!.count++
  }
  const byJoinMonth = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key))
  const byJoinQuarter = [...quarterMap.values()].sort((a, b) => a.key.localeCompare(b.key))

  const byBU: BUAttendanceBreakdown[] = [...buMap.entries()]
    .map(([businessUnit, v]) => ({
      businessUnit,
      totalConfirmed: v.totalConfirmed,
      attended: v.attended,
      upcoming: v.upcoming,
      yetToAttend: v.totalConfirmed - v.attended - v.upcoming,
      coverageRatio: v.totalConfirmed > 0 ? (v.attended / v.totalConfirmed) * 100 : 0,
    }))
    .sort((a, b) => b.yetToAttend - a.yetToAttend)

  return {
    totalConfirmedStaff: roster.length,
    totalAttended,
    totalUpcoming,
    totalYetToAttend: list.length,
    overallCoverageRatio: roster.length > 0 ? (totalAttended / roster.length) * 100 : 0,
    byBU,
    list: list.sort((a, b) => a.businessUnit.localeCompare(b.businessUnit) || a.staffName.localeCompare(b.staffName)),
    byJoinMonth,
    byJoinQuarter,
    hasRosterData: allRoster.length > 0,
    availableYears,
    unconfirmedStaffCount,
    internStaffCount,
    meriMoverStaffCount,
  }
}
