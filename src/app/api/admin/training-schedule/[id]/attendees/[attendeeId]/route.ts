import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { attendeeId } = await params
    await prisma.trainingScheduleAttendee.delete({ where: { id: attendeeId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-schedule/attendees DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove attendee.' }, { status: 500 })
  }
}
