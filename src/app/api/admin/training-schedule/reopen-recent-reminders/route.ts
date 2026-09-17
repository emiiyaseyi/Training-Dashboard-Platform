import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import type { SurveyStage } from '@/lib/survey-email'

const STAGE_SENT_FIELD: Record<SurveyStage, 'preSurveySentAt' | 'post1SurveySentAt' | 'post2SurveySentAt'> = {
  pre: 'preSurveySentAt', post1: 'post1SurveySentAt', post2: 'post2SurveySentAt',
}
const STAGE_RESPONDED_FIELD: Record<SurveyStage, 'preSurveyRespondedAt' | 'post1SurveyRespondedAt' | 'post2SurveyRespondedAt'> = {
  pre: 'preSurveyRespondedAt', post1: 'post1SurveyRespondedAt', post2: 'post2SurveyRespondedAt',
}
const STAGE_REMINDER_FIELD: Record<SurveyStage, 'preReminderAt' | 'post1ReminderAt' | 'post2ReminderAt'> = {
  pre: 'preReminderAt', post1: 'post1ReminderAt', post2: 'post2ReminderAt',
}

// One-time cleanup for reminders sent by "Send Reminders to Everyone Outstanding" BEFORE the fix
// that made a forced reminder to an already-expired attendee reset their sentAt too (a real
// reopen, not just a re-nudge of a dead link). Anyone caught by that gap already has a real,
// successful SurveySendLog row for the reminder that went out — this just applies the same reopen
// retroactively using that log, so nothing gets re-emailed. Safe to run more than once: an
// attendee whose sentAt is already current (not expired) is left untouched.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { hours = 24 } = (await req.json().catch(() => ({}))) as { hours?: number }
    const since = new Date(Date.now() - hours * 3600_000)

    const logs = await prisma.surveySendLog.findMany({
      where: { isReminder: true, success: true, sentAt: { gte: since } },
      orderBy: { sentAt: 'desc' },
    })

    // Most recent log per (attendeeId, stage) — a batch can legitimately log more than one
    // reminder for the same person if it was run twice.
    const latestByKey = new Map<string, (typeof logs)[number]>()
    for (const log of logs) {
      const key = `${log.attendeeId}:${log.stage}`
      if (!latestByKey.has(key)) latestByKey.set(key, log)
    }

    const settings = await prisma.surveySettings.findFirst()
    const expiryEnabled = settings?.expiryEnabled ?? true
    const expiryDays = settings?.expiryDays ?? 7
    const now = Date.now()

    let reopened = 0
    let alreadyFine = 0
    let skippedResponded = 0

    for (const log of latestByKey.values()) {
      const stage = log.stage as SurveyStage
      const sentField = STAGE_SENT_FIELD[stage]
      const respondedField = STAGE_RESPONDED_FIELD[stage]
      const reminderField = STAGE_REMINDER_FIELD[stage]
      if (!sentField) continue

      const attendee = await prisma.trainingScheduleAttendee.findUnique({ where: { id: log.attendeeId } })
      if (!attendee) continue
      if (attendee[respondedField]) { skippedResponded++; continue }

      const sentAt = attendee[sentField]
      const stillExpired = !sentAt || (expiryEnabled && now - sentAt.getTime() >= expiryDays * 86400000)
      if (!stillExpired) { alreadyFine++; continue }

      await prisma.trainingScheduleAttendee.update({
        where: { id: attendee.id },
        data: { [sentField]: log.sentAt, [reminderField]: log.sentAt },
      })
      reopened++
    }

    return NextResponse.json({ checked: latestByKey.size, reopened, alreadyFine, skippedResponded })
  } catch (err) {
    console.error('[admin/training-schedule/reopen-recent-reminders POST]', err)
    return NextResponse.json({ error: 'Failed to reopen recent reminders.' }, { status: 500 })
  }
}
