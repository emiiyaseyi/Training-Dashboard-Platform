import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Deletes every TrainingRecord row for one training/month/year cohort at once ("delete this whole
// training" from the grouped view) — optionally also the matching TrainingSchedule(s), if any
// exist for the same training name, when the admin explicitly opts in (never implied automatically,
// since that would also remove attendees' survey send history).
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { training, month, year, alsoDeleteSchedule } = await req.json() as {
      training: string; month: string; year: number; alsoDeleteSchedule?: boolean
    }
    if (!training?.trim() || !month || !year) {
      return NextResponse.json({ error: 'training, month, and year are required.' }, { status: 400 })
    }

    // Case-insensitive match done in JS, not the Prisma query — SQLite (local) has no
    // case-insensitive `mode`, only Postgres (production) does, and the two must behave the same.
    const trainingKey = training.trim().toLowerCase()
    const candidates = await prisma.trainingRecord.findMany({ where: { month, year: Number(year) }, select: { id: true, training: true } })
    const idsToDelete = candidates.filter((r) => r.training.trim().toLowerCase() === trainingKey).map((r) => r.id)
    const deleted = idsToDelete.length > 0
      ? await prisma.trainingRecord.deleteMany({ where: { id: { in: idsToDelete } } })
      : { count: 0 }

    let schedulesDeleted = 0
    if (alsoDeleteSchedule) {
      const scheduleCandidates = await prisma.trainingSchedule.findMany({ select: { id: true, trainingName: true } })
      const scheduleIds = scheduleCandidates.filter((s) => s.trainingName.trim().toLowerCase() === trainingKey).map((s) => s.id)
      if (scheduleIds.length > 0) {
        const result = await prisma.trainingSchedule.deleteMany({ where: { id: { in: scheduleIds } } })
        schedulesDeleted = result.count
      }
    }

    return NextResponse.json({ recordsDeleted: deleted.count, schedulesDeleted })
  } catch (err) {
    console.error('[admin/records/training/delete-group POST]', err)
    return NextResponse.json({ error: 'Failed to delete training.' }, { status: 500 })
  }
}
