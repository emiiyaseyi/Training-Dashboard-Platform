import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff, resolveLineManager } from '@/lib/staff-directory'

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
      const staff = resolveStaff(attendee.staffId, directory)
      if (!staff) {
        stillMissing.push(attendee.staffName)
        continue
      }
      const manager = resolveLineManager(staff, directory)
      const next = {
        staffName: staff.name,
        email: staff.email,
        lineManagerName: manager?.name || null,
        lineManagerEmail: manager?.email || null,
      }
      const changed =
        next.staffName !== attendee.staffName || next.email !== attendee.email ||
        next.lineManagerName !== attendee.lineManagerName || next.lineManagerEmail !== attendee.lineManagerEmail
      if (changed) {
        await prisma.trainingScheduleAttendee.update({ where: { id: attendee.id }, data: next })
        updated++
      }
      if (!staff.email) stillMissing.push(staff.name)
    }

    return NextResponse.json({ updated, total: schedule.attendees.length, stillMissing })
  } catch (err) {
    console.error('[admin/training-schedule/attendees/refresh POST]', err)
    return NextResponse.json({ error: 'Failed to refresh attendees.' }, { status: 500 })
  }
}
