import { prisma } from '@/lib/prisma'
import { loadRosterDirectory, resolveStaffLoose, type ResolvedStaff } from '@/lib/staff-directory'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { MONTHS } from '@/lib/filter-types'

// Talent Member (TM) Trainings — a Training Type ("TM") tracked against a real, named roster.
// The roster itself is admin-entered (TalentMemberRosterEntry, managed from Admin → Talent Member
// Roster — bulk or one at a time, by name/Staff ID/email), each entry resolved here against the
// staff directory for display name/BU/email.
//
// "Attended" is the union of two sources, since either one on its own misses real completions:
//  - TrainingRecord rows tagged Training Type = "TM" (the bulk-uploaded/synced "2026 Training
//    Data" sheet) — this is the primary source for historical/already-attended TM trainings,
//    since that's where the admin's real completion data actually lives. Only has month-level
//    dates (no exact day) and no vendor.
//  - TrainingSchedule rows with trainingType = "TM" whose end date has passed — trainings the
//    admin scheduled and sent surveys for in-app, which carries an exact date and vendor.
// A person needs to show up in only one of the two to count as trained; "upcoming" still comes
// from TrainingSchedule only, since a TrainingRecord row by definition already happened.

export interface TMAttendedRecord {
  recordId: string | null // TrainingRecord id — set only for source: 'record', so its vendor can be edited after the fact (no vendor column at upload time)
  source: 'schedule' | 'record'
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

export interface TMUnresolvedRosterEntry {
  id: string
  staffId: string | null
  name: string | null
  email: string | null
}

export interface TMExcludedAttendance {
  id: string
  staffId: string
  staffName: string
  training: string
  month: string
}

export interface TalentMemberFullReport {
  year: number
  totalTalentMembers: number
  staffTrained: number
  staffNotTrained: number
  staffExempted: number
  totalSpend: number
  coveragePct: number
  staffWithUpcomingTraining: number
  distinctTrainingsDelivered: number
  attended: TMAttendedRecord[]
  upcoming: TMUpcomingRecord[]
  exempted: TMExemptedRecord[]
  yetToAttend: TMYetToAttendRecord[]
  unresolvedRosterEntries: TMUnresolvedRosterEntry[]
  excludedAttendance: TMExcludedAttendance[]
}

// Both TM roster entries and exemptions are entered the same loose way (name/Staff ID/email), so
// they resolve against the staff directory the same way — but the ROSTER is what defines who's a
// Talent Member at all, whereas exemptions must be checked against that roster specifically
// (someone not on the roster can't meaningfully be "exempted" from it).
function resolveAgainstRoster(
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
  const [directory, rosterEntries, exemptions, tmSchedules, yearTrainingRecords] = await Promise.all([
    loadRosterDirectory(),
    prisma.talentMemberRosterEntry.findMany(),
    prisma.talentMemberExemption.findMany({ where: { year } }),
    prisma.trainingSchedule.findMany({
      where: { trainingType: 'TM' },
      include: { attendees: true },
      orderBy: { startDate: 'asc' },
    }),
    prisma.trainingRecord.findMany({ where: { year } }),
  ])
  // Matched in JS, not the Prisma query, so this behaves the same on the sqlite (local) and
  // postgres (production) connectors — sqlite has no case-insensitive `mode` filter. Whitespace
  // is stripped entirely (not just trimmed) so a stray non-breaking space or double space from
  // manual data entry in the Training Type column still matches.
  const normTM = (v: string | null) => (v || '').replace(/\s+/g, '').toLowerCase()
  const tmTrainingRecords = yearTrainingRecords.filter((r) => normTM(r.trainingType) === 'tm')

  const rosterMap = new Map<string, ResolvedStaff>()
  const unresolvedRosterEntries: TMUnresolvedRosterEntry[] = []
  for (const e of rosterEntries) {
    const match = e.staffId || e.name || e.email
      ? resolveStaffLoose(e.staffId || e.name || e.email || '', directory)
      : null
    if (match) rosterMap.set(normalizeStaffIdKey(match.staffId), match)
    else unresolvedRosterEntries.push({ id: e.id, staffId: e.staffId, name: e.name, email: e.email })
  }
  const roster = [...rosterMap.values()]

  const exemptedKeys = new Set<string>()
  const exempted: TMExemptedRecord[] = exemptions.map((e) => {
    const match = resolveAgainstRoster(e, roster)
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
        recordId: null,
        source: 'schedule',
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

  const excludedAttendance: TMExcludedAttendance[] = []
  for (const rec of tmTrainingRecords) {
    const key = normalizeStaffIdKey(rec.staffId)
    if (!rosterKeys.has(key)) {
      // Tagged Training Type = TM, but the Staff ID doesn't match anyone currently on the TM
      // roster — surfaced so the admin can see exactly which "TM" records aren't counting and
      // why (typo'd Staff ID, or a real person who genuinely isn't on this year's roster).
      excludedAttendance.push({ id: rec.id, staffId: rec.staffId, staffName: rec.staffName, training: rec.training, month: rec.month })
      continue
    }
    const monthIdx = MONTHS.indexOf(rec.month as typeof MONTHS[number])
    const approxDate = new Date(rec.year, monthIdx >= 0 ? monthIdx : 0, 1)
    attended.push({
      recordId: rec.id,
      source: 'record',
      staffId: rec.staffId,
      staffName: rec.staffName,
      businessUnit: rec.businessUnit,
      trainingName: rec.training,
      startDate: approxDate,
      endDate: approxDate,
      vendor: rec.vendor,
    })
    attendedKeys.add(key)
    totalSpend += rec.cost
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

  const upcomingStaffKeys = new Set<string>()
  for (const sched of upcomingSchedules) {
    for (const att of sched.attendees) {
      const key = normalizeStaffIdKey(att.staffId)
      if (rosterKeys.has(key)) upcomingStaffKeys.add(key)
    }
  }
  const staffWithUpcomingTraining = upcomingStaffKeys.size

  const distinctTrainingsDelivered = new Set(attended.map((a) => a.trainingName.trim().toLowerCase())).size

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
    staffWithUpcomingTraining,
    distinctTrainingsDelivered,
    attended,
    upcoming,
    exempted,
    yetToAttend,
    unresolvedRosterEntries,
    excludedAttendance,
  }
}
