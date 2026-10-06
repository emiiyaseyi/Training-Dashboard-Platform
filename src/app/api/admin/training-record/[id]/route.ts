import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { archiveDeletedRecord } from '@/lib/deleted-records'

// Deletes a single TrainingRecord row — specifically for cleaning up stale duplicates left behind
// when a Staff ID gets corrected directly in the source sheet. The sheet sync is add-only (it
// only ever inserts rows it hasn't seen before, keyed partly on Staff ID) so fixing a typo'd ID
// there creates a fresh, correct row on the next sync rather than updating the old one in place —
// the old, wrong-ID row is otherwise never removed on its own.
//
// Archives before deleting and attempts to remove the matching row from the live sheet too (same
// as every other training delete route) — this one previously hard-deleted the DB row only, which
// left the stale row sitting in the source sheet to be re-imported on the very next sync, exactly
// recreating the duplicate this button exists to clean up.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const record = await prisma.trainingRecord.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: 'Record not found.' }, { status: 404 })

    const { sheetMoved, sheetMoveError } = await archiveDeletedRecord(
      'training',
      record,
      { name: gate.user.name, email: gate.user.email },
      [
        { columnCandidates: ['staffid', 'staffno', 'employeeid', 'employeeno', 'id'], value: record.staffId },
        { columnCandidates: ['training', 'trainingname', 'trainingtitle', 'course', 'programme'], value: record.training },
        { columnCandidates: ['month', 'period', 'trainingmonth'], value: record.month },
      ],
    )

    await prisma.trainingRecord.delete({ where: { id } })
    return NextResponse.json({ success: true, sheetMoved, sheetMoveError })
  } catch (err) {
    console.error('[admin/training-record/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete training record.' }, { status: 500 })
  }
}
