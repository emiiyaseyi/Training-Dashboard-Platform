import { prisma } from '@/lib/prisma'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'
import { normalizeStaffIdKey } from '@/lib/staff-id'

// Kept intentionally separate from analytics.ts — this report reads TrainingRecord for
// attendance but never writes back to it, and touches no other report's calculations.

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
  yetToAttend: number
  coverageRatio: number
}

export interface YetToAttendReport {
  totalConfirmedStaff: number
  totalAttended: number
  totalYetToAttend: number
  overallCoverageRatio: number
  byBU: BUAttendanceBreakdown[]
  list: YetToAttendStaff[]
  hasRosterData: boolean
  availableYears: number[]
}

export async function computeYetToAttend(filter: PeriodFilter, buScope?: string[] | null): Promise<YetToAttendReport> {
  const [allRoster, allTraining] = await Promise.all([
    prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.trainingRecord.findMany({ select: { staffId: true, year: true, month: true } }),
  ])

  const availableYears = [...new Set(allTraining.map((r) => r.year))].sort((a, b) => b - a)

  // Roster is a snapshot, not a cumulative log — dedupe by staffId, most recent upload wins.
  const latestByStaffId = new Map<string, (typeof allRoster)[number]>()
  for (const r of allRoster) latestByStaffId.set(r.staffId, r)

  let roster = [...latestByStaffId.values()].filter((r) => r.confirmed)
  if (buScope) roster = roster.filter((r) => buScope.includes(r.businessUnit))

  let training = allTraining
  if (filter.mode !== 'all' && filter.year) {
    training = training.filter((r) => r.year === filter.year)
  }
  const months = allowedMonths(filter)
  if (months) {
    training = training.filter((r) => months.has(r.month))
  }
  const attendedStaffIds = new Set(training.map((r) => normalizeStaffIdKey(r.staffId)))

  const list: YetToAttendStaff[] = []
  let totalAttended = 0
  const buMap = new Map<string, { totalConfirmed: number; attended: number }>()

  for (const staff of roster) {
    const attended = attendedStaffIds.has(normalizeStaffIdKey(staff.staffId))
    if (attended) totalAttended++

    const bu = buMap.get(staff.businessUnit) || { totalConfirmed: 0, attended: 0 }
    bu.totalConfirmed++
    if (attended) bu.attended++
    buMap.set(staff.businessUnit, bu)

    if (!attended) {
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
      yetToAttend: v.totalConfirmed - v.attended,
      coverageRatio: v.totalConfirmed > 0 ? v.attended / v.totalConfirmed : 0,
    }))
    .sort((a, b) => b.yetToAttend - a.yetToAttend)

  return {
    totalConfirmedStaff: roster.length,
    totalAttended,
    totalYetToAttend: roster.length - totalAttended,
    overallCoverageRatio: roster.length > 0 ? totalAttended / roster.length : 0,
    byBU,
    list: list.sort((a, b) => a.businessUnit.localeCompare(b.businessUnit) || a.staffName.localeCompare(b.staffName)),
    hasRosterData: allRoster.length > 0,
    availableYears,
  }
}
