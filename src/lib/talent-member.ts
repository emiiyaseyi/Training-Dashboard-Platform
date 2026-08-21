import { prisma } from '@/lib/prisma'
import { loadRosterDirectory, type ResolvedStaff } from '@/lib/staff-directory'
import { normalizeStaffIdKey } from '@/lib/staff-id'

// Talent Member (TM) Trainings — a Training Type ("TM") tracked against a real, named roster
// (StaffRosterRecord + comprehensive staff list "Is Talent Member" column), not just an aggregate
// headcount. "Attended" and "upcoming" are both derived from TrainingSchedule (Training Type =
// TM) rather than the bulk-uploaded TrainingRecord data, because that's the only source that
// carries an exact date and a real (admin-configured, not guessed) vendor per training — a
// TrainingSchedule row not created in-app simply won't appear here, by design, rather than being
// approximated.

export interface TMAttendedRecord {
  staffId: string
  staffName: string
  businessUnit: string
  trainingName: string
  startDate: Date
  endDate: Date
  vendor: string | null
}

export interface TMUpcomingRecord {
  scheduleId: string
  trainingName: string
  businessUnit: string
  startDate: Date
  endDate: Date
  vendor: string | null
  attendeeCount: number
}

export interface TMExemptedRecord {
  id: string
  staffId: string | null
  name: string | null
  email: string | null
  reason: string | null
  resolved: boolean // true if this entry matched an actual current Talent Member on the roster
}

export interface TMYetToAttendRecord {
  staffId: string
  staffName: string
  businessUnit: string
  email: string | null
}

export interface TalentMemberFullReport {
  year: number
  totalTalentMembers: number
  staffTrained: number
  staffNotTrained: number
  staffExempted: number
  totalSpend: number
  coveragePct: number
  attended: TMAttendedRecord[]
  upcoming: TMUpcomingRecord[]
  exempted: TMExemptedRecord[]
  yetToAttend: TMYetToAttendRecord[]
}

function resolveExemption(
  e: { staffId: string | null; name: string | null; email: string | null },
  roster: ResolvedStaff[]
): ResolvedStaff | null {
  if (e.staffId) {
    const match = roster.find((s) => normalizeStaffIdKey(s.staffId) === normalizeStaffIdKey(e.staffId!))
    if (match) return match
  }
  if (e.email) {
    const match = roster.find((s) => s.email?.toLowerCase() === e.email!.toLowerCase())
    if (match) return match
  }
  if (e.name) {
    const match = roster.find((s) => s.name.toLowerCase() === e.name!.toLowerCase())
    if (match) return match
  }
  return null
}

export async function computeTalentMemberReport(year: number): Promise<TalentMemberFullReport> {
  const [directory, exemptions, tmSchedules] = await Promise.all([
    loadRosterDirectory(),
    prisma.talentMemberExemption.findMany({ where: { year } }),
    prisma.trainingSchedule.findMany({
      where: { trainingType: 'TM' },
      include: { attendees: true },
      orderBy: { startDate: 'asc' },
    }),
  ])

  const roster = [...directory.values()].filter((s) => s.isTalentMember)

  const exemptedKeys = new Set<string>()
  const exempted: TMExemptedRecord[] = exemptions.map((e) => {
    const match = resolveExemption(e, roster)
    if (match) exemptedKeys.add(normalizeStaffIdKey(match.staffId))
    return { id: e.id, staffId: e.staffId, name: e.name, email: e.email, reason: e.reason, resolved: !!match }
  })

  const now = Date.now()
  const pastSchedules = tmSchedules.filter((s) => s.endDate.getTime() < now)
  const upcomingSchedules = tmSchedules.filter((s) => s.endDate.getTime() >= now)

  const rosterKeys = new Set(roster.map((s) => normalizeStaffIdKey(s.staffId)))
  const attended: TMAttendedRecord[] = []
  const attendedKeys = new Set<string>()
  let totalSpend = 0

  for (const sched of pastSchedules) {
    for (const att of sched.attendees) {
      const key = normalizeStaffIdKey(att.staffId)
      if (!rosterKeys.has(key)) continue // only Talent Members count toward TM completion
      attended.push({
        staffId: att.staffId,
        staffName: att.staffName,
        businessUnit: sched.businessUnit,
        trainingName: sched.trainingName,
        startDate: sched.startDate,
        endDate: sched.endDate,
        vendor: sched.vendor,
      })
      attendedKeys.add(key)
      if (sched.costPerAttendee) totalSpend += sched.costPerAttendee
    }
  }

  const upcoming: TMUpcomingRecord[] = upcomingSchedules.map((s) => ({
    scheduleId: s.id,
    trainingName: s.trainingName,
    businessUnit: s.businessUnit,
    startDate: s.startDate,
    endDate: s.endDate,
    vendor: s.vendor,
    attendeeCount: s.attendees.length,
  }))

  const yetToAttend: TMYetToAttendRecord[] = roster
    .filter((s) => {
      const key = normalizeStaffIdKey(s.staffId)
      return !attendedKeys.has(key) && !exemptedKeys.has(key)
    })
    .map((s) => ({ staffId: s.staffId, staffName: s.name, businessUnit: s.businessUnit, email: s.email }))

  const totalTalentMembers = roster.length
  const staffExempted = exemptedKeys.size
  const staffTrained = attendedKeys.size
  const staffNotTrained = yetToAttend.length
  const denominator = totalTalentMembers - staffExempted
  const coveragePct = denominator > 0 ? (staffTrained / denominator) * 100 : 0

  return {
    year,
    totalTalentMembers,
    staffTrained,
    staffNotTrained,
    staffExempted,
    totalSpend,
    coveragePct,
    attended,
    upcoming,
    exempted,
    yetToAttend,
  }
}
