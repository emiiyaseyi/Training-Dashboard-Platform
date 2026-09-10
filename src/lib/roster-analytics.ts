import { prisma } from '@/lib/prisma'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'
import { normalizeStaffIdKey } from '@/lib/staff-id'

// Kept intentionally separate from analytics.ts — this report reads TrainingRecord (and, for the
// same reason Talent Members unions two sources — see computeTalentMemberReport — TrainingSchedule)
// for attendance but never writes back to either, and touches no other report's calculations.

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
  return [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ')
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
  hasRosterData: boolean
  availableYears: number[]
  // Roster composition context, independent of attendance — surfaced as their own cards rather
  // than folded into the confirmed-staff coverage numbers above.
  unconfirmedStaffCount: number
  internStaffCount: number
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
  const pastSchedules = allSchedules.filter((s) => s.endDate.getTime() < now)
  const upcomingSchedules = allSchedules.filter((s) => s.endDate.getTime() >= now)

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

  let roster = latestRoster.filter((r) => r.confirmed)
  if (buScope) roster = roster.filter((r) => buScope.includes(r.businessUnit))

  let scopedRoster = latestRoster
  if (buScope) scopedRoster = scopedRoster.filter((r) => buScope.includes(r.businessUnit))
  const unconfirmedStaffCount = scopedRoster.filter((r) => !r.confirmed).length
  const internStaffCount = scopedRoster.filter((r) => (r.employmentType || '').trim().toLowerCase() === 'intern').length

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
    hasRosterData: allRoster.length > 0,
    availableYears,
    unconfirmedStaffCount,
    internStaffCount,
  }
}
