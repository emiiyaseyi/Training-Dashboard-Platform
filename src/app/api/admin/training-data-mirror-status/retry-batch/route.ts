import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { mirrorAttendeesToTrainingData } from '@/lib/training-data-mirror'

// Batch sibling of the per-attendee retry route — retrying N unsynced attendees one at a time
// meant N separate connect+read-headers+append round trips, run automatically on every visit to
// this panel. Groups attendees by schedule (each schedule mirrors with its own training
// name/cost/etc.) and does one batch append per schedule instead of one per attendee.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { attendeeIds } = await req.json() as { attendeeIds: string[] }
    if (!Array.isArray(attendeeIds) || attendeeIds.length === 0) {
      return NextResponse.json({ error: 'Provide at least one attendee id.' }, { status: 400 })
    }

    const attendees = await prisma.trainingScheduleAttendee.findMany({ where: { id: { in: attendeeIds } } })
    const scheduleIds = [...new Set(attendees.map((a) => a.scheduleId))]
    const schedules = await prisma.trainingSchedule.findMany({ where: { id: { in: scheduleIds } } })
    const scheduleById = new Map(schedules.map((s) => [s.id, s]))

    const byScheduleId = new Map<string, typeof attendees>()
    for (const a of attendees) {
      if (!byScheduleId.has(a.scheduleId)) byScheduleId.set(a.scheduleId, [])
      byScheduleId.get(a.scheduleId)!.push(a)
    }

    for (const [scheduleId, group] of byScheduleId) {
      const schedule = scheduleById.get(scheduleId)
      if (!schedule) continue
      const results = await mirrorAttendeesToTrainingData(group, schedule)
      await Promise.all(
        group.map((attendee) => {
          const result = results.get(attendee.id)
          if (!result?.attempted) return null
          return prisma.trainingScheduleAttendee.update({
            where: { id: attendee.id },
            data: { trainingDataSyncedAt: result.success ? new Date() : null, trainingDataSyncError: result.success ? null : result.message },
          })
        })
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-data-mirror-status/retry-batch POST]', err)
    return NextResponse.json({ error: 'Failed to retry sync.' }, { status: 500 })
  }
}
