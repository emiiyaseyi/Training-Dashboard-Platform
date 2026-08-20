import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Every attendee not yet confirmed synced to the Training Data sheet, across all schedules —
// used by the admin panel to spot and retry failures without hunting through each schedule.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const attendees = await prisma.trainingScheduleAttendee.findMany({
    where: { trainingDataSyncedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { schedule: true },
  })

  return NextResponse.json(
    attendees.map((a) => ({
      id: a.id,
      scheduleId: a.scheduleId,
      staffName: a.staffName,
      trainingName: a.schedule.trainingName,
      createdAt: a.createdAt,
      trainingDataSyncError: a.trainingDataSyncError,
    }))
  )
}
