import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff, resolveLineManager } from '@/lib/staff-directory'
import { mirrorAttendeesToTrainingData } from '@/lib/training-data-mirror'
import type { TrainingScheduleAttendee } from '@prisma/client'

// Accepts a list of Staff IDs or emails, resolves each against the roster (name, email, line
// manager name/email) and adds them as attendees. Unresolvable identifiers are reported back
// rather than silently skipped, since a missing email means that person can never be surveyed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const { identifiers } = (await req.json()) as { identifiers: string[] }
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: 'Provide at least one Staff ID or email.' }, { status: 400 })
    }

    const schedule = await prisma.trainingSchedule.findUnique({ where: { id } })
    if (!schedule) return NextResponse.json({ error: 'Training schedule not found.' }, { status: 404 })

    const directory = await loadRosterDirectory()
    const added: string[] = []
    const notFound: string[] = []
    const noEmail: string[] = []
    const createdAttendees: TrainingScheduleAttendee[] = []

    for (const raw of identifiers) {
      const identifier = raw.trim()
      if (!identifier) continue
      const staff = resolveStaff(identifier, directory)
      if (!staff) {
        notFound.push(identifier)
        continue
      }
      const manager = resolveLineManager(staff, directory)
      const attendee = await prisma.trainingScheduleAttendee.create({
        data: {
          scheduleId: id,
          staffId: staff.staffId,
          staffName: staff.name,
          email: staff.email,
          lineManagerName: manager?.name || null,
          lineManagerEmail: manager?.email || null,
        },
      })
      added.push(staff.name)
      createdAttendees.push(attendee)
      if (!staff.email) noEmail.push(staff.name)
    }

    // Mirror all newly-added attendees into the Training Data sheet in one batch call — one
    // connect + read-headers + append round trip for the whole group, not one per attendee (which
    // is what made adding several people to a schedule slow). Outcome is persisted per attendee
    // (not just logged) so a failure is visible to the admin and retryable — this schedule is just
    // another way of getting rows into that same tab, not a separate pipeline, so no direct
    // TrainingRecord write or dedup handling is needed here.
    // Skipped for schedules sourced from Already Attended Trainings — those attendees came FROM
    // an existing Training Data row, so mirroring them again would create a duplicate.
    if (!schedule.sourcedFromHistoricalData && createdAttendees.length > 0) {
      const results = await mirrorAttendeesToTrainingData(createdAttendees, schedule)
      await Promise.all(
        createdAttendees.map((attendee) => {
          const result = results.get(attendee.id)
          if (!result?.attempted) return null
          return prisma.trainingScheduleAttendee.update({
            where: { id: attendee.id },
            data: { trainingDataSyncedAt: result.success ? new Date() : null, trainingDataSyncError: result.success ? null : result.message },
          })
        })
      )
    }

    return NextResponse.json({ added: added.length, notFound, noEmail })
  } catch (err) {
    console.error('[admin/training-schedule/attendees POST]', err)
    return NextResponse.json({ error: 'Failed to add attendees.' }, { status: 500 })
  }
}
