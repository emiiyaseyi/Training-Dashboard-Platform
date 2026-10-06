import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const RESPONDED_FIELD = {
  pre: 'preSurveyRespondedAt',
  post1: 'post1SurveyRespondedAt',
  post2: 'post2SurveyRespondedAt',
} as const

export interface ReminderTimingViolation {
  staffName: string
  trainingName: string
  stage: string
  respondedAt: string
  reminderSentAt: string
  minutesAfterResponse: number
}

// Direct, unambiguous check for "is a reminder actually going out to someone who already
// responded" — rather than inferring it from respondedAt being null (the earlier, wrong theory;
// repair-responded-flags found 0 cases of that). This instead looks at the real send history: for
// every attendee with a responded timestamp, did any REMINDER (isReminder: true) land in
// SurveySendLog with a sentAt strictly AFTER that timestamp? If yes, that's not a maybe — it's a
// reminder that went out after they'd already filled the form, full stop.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const violations: ReminderTimingViolation[] = []

    for (const stage of ['pre', 'post1', 'post2'] as const) {
      const field = RESPONDED_FIELD[stage]
      // Selects all three *RespondedAt fields explicitly (rather than a computed select key, which
      // Prisma's generated types don't reliably accept) and reads the one matching `field` at
      // runtime below.
      const responded = await prisma.trainingScheduleAttendee.findMany({
        where: { [field]: { not: null } },
        select: {
          id: true, staffName: true,
          preSurveyRespondedAt: true, post1SurveyRespondedAt: true, post2SurveyRespondedAt: true,
          schedule: { select: { trainingName: true } },
        },
      })
      if (responded.length === 0) continue

      const attendeeIds = responded.map((a) => a.id)
      const reminders = await prisma.surveySendLog.findMany({
        where: { attendeeId: { in: attendeeIds }, stage, isReminder: true, success: true },
        select: { attendeeId: true, sentAt: true },
      })
      const remindersByAttendee = new Map<string, Date[]>()
      for (const r of reminders) {
        const list = remindersByAttendee.get(r.attendeeId) || []
        list.push(r.sentAt)
        remindersByAttendee.set(r.attendeeId, list)
      }

      for (const a of responded) {
        // Non-null by construction — the `where` clause above only returns rows where this exact
        // field is set, even though TS can't see that from a computed key.
        const respondedAt = a[field] as Date
        const sends = remindersByAttendee.get(a.id)
        if (!sends) continue
        for (const sentAt of sends) {
          if (sentAt.getTime() > respondedAt.getTime()) {
            violations.push({
              staffName: a.staffName,
              trainingName: a.schedule.trainingName,
              stage,
              respondedAt: respondedAt.toISOString(),
              reminderSentAt: sentAt.toISOString(),
              minutesAfterResponse: Math.round((sentAt.getTime() - respondedAt.getTime()) / 60000),
            })
          }
        }
      }
    }

    violations.sort((a, b) => b.reminderSentAt.localeCompare(a.reminderSentAt))
    return NextResponse.json({ checked: true, violationCount: violations.length, violations })
  } catch (err) {
    console.error('[admin/survey-automation/check-reminder-timing GET]', err)
    return NextResponse.json({ error: 'Failed to check reminder timing.' }, { status: 500 })
  }
}
