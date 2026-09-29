import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Resolves a "same person, same training, different Month/Year" group the admin has looked at
// and picked one record to keep — deletes the rest. If any deleted record was the auto-linked
// mirror of a scheduled attendee (see training-schedule/[id]/attendees/route.ts), that link is
// repointed to the kept record instead of just going dangling, so the schedule side still knows
// which TrainingRecord is theirs.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { keepId, deleteIds } = (await req.json()) as { keepId?: string; deleteIds?: string[] }
    if (!keepId || !Array.isArray(deleteIds) || deleteIds.length === 0) {
      return NextResponse.json({ error: 'keepId and deleteIds are required.' }, { status: 400 })
    }
    if (deleteIds.includes(keepId)) {
      return NextResponse.json({ error: 'keepId cannot also be in deleteIds.' }, { status: 400 })
    }

    const relinked = await prisma.trainingScheduleAttendee.updateMany({
      where: { linkedTrainingRecordId: { in: deleteIds } },
      data: { linkedTrainingRecordId: keepId },
    })

    const { count } = await prisma.trainingRecord.deleteMany({ where: { id: { in: deleteIds } } })

    return NextResponse.json({ deleted: count, relinked: relinked.count })
  } catch (err) {
    console.error('[admin/records/training/possible-duplicates/resolve POST]', err)
    return NextResponse.json({ error: 'Failed to resolve duplicate.' }, { status: 500 })
  }
}
