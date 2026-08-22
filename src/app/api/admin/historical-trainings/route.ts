import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Groups already-uploaded Training Data (TrainingRecord) rows into training "instances" — same
// training name + month/year cohort — so the admin can pick one and retroactively send
// Post-1/Post-2 surveys to its attendees via "Already Attended Trainings". Business Unit is a
// property of each attendee, not of the training itself (the same session commonly has attendees
// from several BUs), so it's tracked per-attendee rather than splitting one training into a
// separate card per BU. Each instance also reports whether a TrainingSchedule already exists for
// the same training name, as a duplicate hint (not a hard block — the admin might legitimately
// want a second round).
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const [records, schedules] = await Promise.all([
      prisma.trainingRecord.findMany({
        select: { training: true, businessUnit: true, month: true, year: true, staffId: true, staffName: true },
      }),
      prisma.trainingSchedule.findMany({ select: { trainingName: true } }),
    ])

    const existingScheduleNames = new Set(schedules.map((s) => s.trainingName.trim().toLowerCase()))

    const groups = new Map<string, {
      training: string; month: string; year: number
      attendees: Map<string, { staffId: string; staffName: string; businessUnit: string }>
    }>()

    for (const r of records) {
      if (!r.training?.trim()) continue
      const key = `${r.training.trim().toLowerCase()}|${r.month}|${r.year}`
      if (!groups.has(key)) {
        groups.set(key, { training: r.training.trim(), month: r.month, year: r.year, attendees: new Map() })
      }
      groups.get(key)!.attendees.set(r.staffId, { staffId: r.staffId, staffName: r.staffName, businessUnit: r.businessUnit })
    }

    const result = [...groups.values()]
      .map((g) => {
        const attendees = [...g.attendees.values()].sort((a, b) => a.staffName.localeCompare(b.staffName))
        const businessUnits = [...new Set(attendees.map((a) => a.businessUnit))].sort()
        return {
          training: g.training,
          businessUnits,
          month: g.month,
          year: g.year,
          attendeeCount: attendees.length,
          attendees,
          hasExistingSchedule: existingScheduleNames.has(g.training.toLowerCase()),
        }
      })
      .sort((a, b) => (b.year - a.year) || a.training.localeCompare(b.training))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/historical-trainings GET]', err)
    return NextResponse.json({ error: 'Failed to load historical trainings.' }, { status: 500 })
  }
}
