import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Dismisses a detected change without touching the TrainingRecord — for a false-positive match
// (e.g. two different people with the same name) or a diff not worth applying. Re-syncing will
// raise it again if the underlying disagreement is still there.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.trainingRecordChange.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-record-changes/[id]/reject]', err)
    return NextResponse.json({ error: 'Failed to dismiss this change.' }, { status: 500 })
  }
}
