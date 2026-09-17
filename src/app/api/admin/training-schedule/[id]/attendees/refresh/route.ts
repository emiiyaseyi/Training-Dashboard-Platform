import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveCurrentAttendeeFields } from '@/lib/staff-directory'

// Attendee email/line-manager fields are snapshotted at add-time (see schema comment) so sending
// stays correct even if the roster changes later — but that also means fixing a missing email in
// the roster afterward does NOT retroactively fix an attendee already added without one. This
// re-resolves every attendee on the schedule against the CURRENT roster and updates them.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const schedule = await prisma.trainingSchedule.findUnique({ where: { id }, include: { attendees: true } })
    if (!schedule) return NextResponse.json({ error: 'Training schedule not found.' }, { status: 404 })

    const directory = await loadRosterDirectory()
    let updated = 0
    const stillMissing: string[] = []

    for (const attendee of schedule.attendees) {
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

    return NextResponse.json({ updated, total: schedule.attendees.length, stillMissing })
  } catch (err) {
    console.error('[admin/training-schedule/attendees/refresh POST]', err)
    return NextResponse.json({ error: 'Failed to refresh attendees.' }, { status: 500 })
  }
}
