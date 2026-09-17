import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveCurrentAttendeeFields } from '@/lib/staff-directory'

// Same re-resolve-against-the-current-roster logic as the per-schedule "Refresh from Roster"
// button, but across every schedule at once — so a Line Manager change on an Employee record can
// be corrected everywhere it's cached (every not-yet-sent survey, on every schedule) in one click,
// instead of the admin having to open and refresh each schedule individually.
export async function POST(_req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const schedules = await prisma.trainingSchedule.findMany({ include: { attendees: true } })
    const directory = await loadRosterDirectory()
    let updated = 0
    let total = 0
    const stillMissing: string[] = []

    for (const schedule of schedules) {
      for (const attendee of schedule.attendees) {
        total++
        const next = resolveCurrentAttendeeFields(attendee.staffId, directory)
        if (!next) {
          stillMissing.push(attendee.staffName)
          continue
        }
        const changed =
          next.staffName !== attendee.staffName || next.email !== attendee.email ||
          next.lineManagerName !== attendee.lineManagerName || next.lineManagerEmail !== attendee.lineManagerEmail
        if (changed) {
          await prisma.trainingScheduleAttendee.update({ where: { id: attendee.id }, data: next })
          updated++
        }
        if (!next.email) stillMissing.push(next.staffName)
      }
    }

    return NextResponse.json({ updated, total, scheduleCount: schedules.length, stillMissing })
  } catch (err) {
    console.error('[admin/training-schedule/refresh-all POST]', err)
    return NextResponse.json({ error: 'Failed to refresh attendees across schedules.' }, { status: 500 })
  }
}
