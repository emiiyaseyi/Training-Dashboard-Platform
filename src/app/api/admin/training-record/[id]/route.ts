import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Deletes a single TrainingRecord row — specifically for cleaning up stale duplicates left behind
// when a Staff ID gets corrected directly in the source sheet. The sheet sync is add-only (it
// only ever inserts rows it hasn't seen before, keyed partly on Staff ID) so fixing a typo'd ID
// there creates a fresh, correct row on the next sync rather than updating the old one in place —
// the old, wrong-ID row is otherwise never removed on its own.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.trainingRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-record/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete training record.' }, { status: 500 })
  }
}
