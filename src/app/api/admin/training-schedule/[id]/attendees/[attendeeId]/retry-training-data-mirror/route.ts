import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { mirrorAttendeeToTrainingData } from '@/lib/training-data-mirror'

// Re-runs the Training Data sheet mirror for one already-added attendee — does not create a new
// attendee row or duplicate anything already on the sheet; only the append is retried.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id, attendeeId } = await params
  const [schedule, attendee] = await Promise.all([
    prisma.trainingSchedule.findUnique({ where: { id } }),
    prisma.trainingScheduleAttendee.findUnique({ where: { id: attendeeId } }),
  ])
  if (!schedule) return NextResponse.json({ error: 'Training schedule not found.' }, { status: 404 })
  if (!attendee || attendee.scheduleId !== id) return NextResponse.json({ error: 'Attendee not found on this schedule.' }, { status: 404 })

  const result = await mirrorAttendeeToTrainingData(attendee, schedule)
  await prisma.trainingScheduleAttendee.update({
    where: { id: attendee.id },
    data: { trainingDataSyncedAt: result.success ? new Date() : null, trainingDataSyncError: result.success ? null : result.message },
  })

  return NextResponse.json(result)
}
