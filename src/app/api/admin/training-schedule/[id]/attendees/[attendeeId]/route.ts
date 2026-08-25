import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Sets one attendee's own additionalCc — only meaningful when the schedule's additionalCcMode is
// "individual" (see scheduleCcFor in survey-send.ts), but harmless to store either way.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { attendeeId } = await params
    const { additionalCc } = (await req.json()) as { additionalCc?: string }
    const attendee = await prisma.trainingScheduleAttendee.update({
      where: { id: attendeeId },
      data: { additionalCc: additionalCc?.trim() || null },
    })
    return NextResponse.json(attendee)
  } catch (err) {
    console.error('[admin/training-schedule/attendees PUT]', err)
    return NextResponse.json({ error: 'Failed to update attendee.' }, { status: 500 })
  }
}

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
