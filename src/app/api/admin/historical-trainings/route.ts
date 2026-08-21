import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Groups already-uploaded Training Data (TrainingRecord) rows into training "instances" — same
// training name + Business Unit + month/year cohort — so the admin can pick one and retroactively
// send Post-1/Post-2 surveys to its attendees via "Already Attended Trainings". Each instance also
// reports whether a TrainingSchedule already exists for the same training name/BU, as a duplicate
// hint (not a hard block — the admin might legitimately want a second round).
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const [records, schedules] = await Promise.all([
      prisma.trainingRecord.findMany({
        select: { training: true, businessUnit: true, month: true, year: true, staffId: true, staffName: true },
      }),
      prisma.trainingSchedule.findMany({ select: { trainingName: true, businessUnit: true } }),
    ])

    const existingScheduleKeys = new Set(schedules.map((s) => `${s.trainingName.trim().toLowerCase()}|${s.businessUnit.trim().toLowerCase()}`))

    const groups = new Map<string, {
      training: string; businessUnit: string; month: string; year: number
      attendees: Map<string, { staffId: string; staffName: string }>
    }>()

    for (const r of records) {
      if (!r.training?.trim()) continue
      const key = `${r.training.trim().toLowerCase()}|${r.businessUnit.trim().toLowerCase()}|${r.month}|${r.year}`
      if (!groups.has(key)) {
        groups.set(key, { training: r.training.trim(), businessUnit: r.businessUnit, month: r.month, year: r.year, attendees: new Map() })
      }
      groups.get(key)!.attendees.set(r.staffId, { staffId: r.staffId, staffName: r.staffName })
    }

    const result = [...groups.values()]
      .map((g) => ({
        training: g.training,
        businessUnit: g.businessUnit,
        month: g.month,
        year: g.year,
        attendeeCount: g.attendees.size,
        attendees: [...g.attendees.values()].sort((a, b) => a.staffName.localeCompare(b.staffName)),
        hasExistingSchedule: existingScheduleKeys.has(`${g.training.toLowerCase()}|${g.businessUnit.trim().toLowerCase()}`),
      }))
      .sort((a, b) => (b.year - a.year) || a.training.localeCompare(b.training))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/historical-trainings GET]', err)
    return NextResponse.json({ error: 'Failed to load historical trainings.' }, { status: 500 })
  }
}
