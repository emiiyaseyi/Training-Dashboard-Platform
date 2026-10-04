import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { archiveDeletedRecord } from '@/lib/deleted-records'

// Resolves a "same person, same training" duplicate group the admin has looked at and picked one
// record to keep — deletes the rest, whether the duplicates share a Month/Year or not. If any
// deleted record was the auto-linked
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

    // Archived (same as the regular single-record delete) rather than hard-deleted, so resolving
    // a duplicate group stays recoverable and shows up in the same audit trail.
    const toDelete = await prisma.trainingRecord.findMany({ where: { id: { in: deleteIds } } })
    for (const record of toDelete) {
      await archiveDeletedRecord(
        'training',
        record,
        { name: gate.user.name, email: gate.user.email },
        [
          { columnCandidates: ['staffid', 'staffno', 'employeeid', 'employeeno', 'id'], value: record.staffId },
          { columnCandidates: ['training', 'trainingname', 'trainingtitle', 'course', 'programme'], value: record.training },
          { columnCandidates: ['month', 'period', 'trainingmonth'], value: record.month },
        ],
      )
    }

    const { count } = await prisma.trainingRecord.deleteMany({ where: { id: { in: deleteIds } } })

    return NextResponse.json({ deleted: count, relinked: relinked.count })
  } catch (err) {
    console.error('[admin/records/training/possible-duplicates/resolve POST]', err)
    return NextResponse.json({ error: 'Failed to resolve duplicate.' }, { status: 500 })
  }
}
