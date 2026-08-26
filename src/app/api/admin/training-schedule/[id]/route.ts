import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { createMailSender } from '@/lib/mailer'
import { buildScheduleChangeEmail, type ScheduleChangeReason } from '@/lib/schedule-change-email'

// Lets an already-created schedule's details be corrected (wrong date, missing vendor, etc.)
// without deleting and re-creating it — which would also wipe its attendee list and survey
// send history. Attendees are managed separately (add/remove attendee endpoints).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json()
    const { trainingName, businessUnit, startDate, endDate, hours, costPerAttendee, trainingType, capability, vendor, remindersEnabled, preEnabled, post1Enabled, post2Enabled, additionalCc, additionalCcMode, trainingMode, location, meetingLink } = body as {
      trainingName: string; businessUnit: string; startDate: string; endDate: string; hours?: number
      costPerAttendee?: number; trainingType?: string; capability?: string; vendor?: string
      remindersEnabled?: boolean; preEnabled?: boolean; post1Enabled?: boolean; post2Enabled?: boolean
      additionalCc?: string; additionalCcMode?: string
      trainingMode?: string; location?: string; meetingLink?: string
    }
    if (!trainingName?.trim()) return NextResponse.json({ error: 'Training name is required.' }, { status: 400 })
    if (!businessUnit?.trim()) return NextResponse.json({ error: 'Business Unit is required.' }, { status: 400 })
    if (!startDate || !endDate) return NextResponse.json({ error: 'Start and end dates are required.' }, { status: 400 })

    const schedule = await prisma.trainingSchedule.update({
      where: { id },
      data: {
        trainingName: trainingName.trim(),
        businessUnit: normalizeBUName(businessUnit),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        hours: hours ? Number(hours) : null,
        costPerAttendee: costPerAttendee ? Number(costPerAttendee) : null,
        trainingType: trainingType?.trim() || null,
        capability: capability?.trim() || null,
        vendor: vendor?.trim() || null,
        ...(remindersEnabled !== undefined ? { remindersEnabled } : {}),
        ...(preEnabled !== undefined ? { preEnabled } : {}),
        ...(post1Enabled !== undefined ? { post1Enabled } : {}),
        ...(post2Enabled !== undefined ? { post2Enabled } : {}),
        ...(additionalCc !== undefined ? { additionalCc: additionalCc.trim() || null } : {}),
        ...(additionalCcMode !== undefined ? { additionalCcMode: additionalCcMode === 'individual' ? 'individual' : 'all' } : {}),
        ...(trainingMode !== undefined && ['physical', 'virtual', 'platform', 'hybrid'].includes(trainingMode) ? {
          trainingMode,
          location: trainingMode === 'physical' || trainingMode === 'hybrid' ? (location?.trim() || null) : null,
          meetingLink: trainingMode === 'virtual' || trainingMode === 'platform' || trainingMode === 'hybrid' ? (meetingLink?.trim() || null) : null,
        } : {}),
      },
    })
    return NextResponse.json(schedule)
  } catch (err) {
    console.error('[admin/training-schedule PUT]', err)
    return NextResponse.json({ error: 'Failed to update training schedule.' }, { status: 500 })
  }
}

// Deleting a schedule is often really "this training got cancelled or moved" — the admin can
// optionally pass a reason (and, for a reschedule, the new dates or a note that they'll follow
// later), which sends a personalised heads-up to every attendee (cc: their line manager, matching
// every other survey email's own Cc convention) BEFORE the schedule and its attendees are removed.
// No reason passed = a plain delete with no notification, unchanged from before.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = (await req.json().catch(() => null)) as {
      reason?: ScheduleChangeReason
      newStartDate?: string
      newEndDate?: string
      communicateLater?: boolean
    } | null

    if (body?.reason) {
      const schedule = await prisma.trainingSchedule.findUnique({ where: { id }, include: { attendees: true } })
      if (schedule) {
        const mailer = await createMailSender()
        try {
          for (const a of schedule.attendees) {
            if (!a.email) continue
            const { subject, html } = buildScheduleChangeEmail({
              recipientName: a.staffName,
              trainingName: schedule.trainingName,
              originalStartDate: schedule.startDate,
              originalEndDate: schedule.endDate,
              reason: body.reason,
              newStartDate: body.newStartDate || null,
              newEndDate: body.newEndDate || null,
              communicateLater: body.communicateLater,
            })
            const cc = a.lineManagerEmail ? [a.lineManagerEmail] : []
            await mailer.send({ to: a.email, cc, subject, html }).catch((err) => {
              console.error('[admin/training-schedule DELETE] notify failed for', a.staffId, err)
            })
          }
        } finally {
          mailer.close()
        }
      }
    }

    await prisma.trainingSchedule.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-schedule DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete training schedule.' }, { status: 500 })
  }
}
