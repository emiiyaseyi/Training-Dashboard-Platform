import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { attendeeId } = await params
    const attendee = await prisma.trainingScheduleAttendee.findUnique({ where: { id: attendeeId }, select: { linkedTrainingRecordId: true } })
    await prisma.trainingScheduleAttendee.delete({ where: { id: attendeeId } })
    // Also remove the TrainingRecord this attendee's add-time write produced, if any — otherwise
    // removing someone added by mistake leaves a phantom record behind in Manage Records/analytics.
    if (attendee?.linkedTrainingRecordId) {
      await prisma.trainingRecord.delete({ where: { id: attendee.linkedTrainingRecordId } }).catch(() => {})
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-schedule/attendees DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove attendee.' }, { status: 500 })
  }
}
