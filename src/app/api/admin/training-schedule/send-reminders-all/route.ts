import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendSurveyReminders } from '@/lib/survey-send'
import type { SurveyStage } from '@/lib/survey-email'

const STAGES: SurveyStage[] = ['pre', 'post1', 'post2']

// Manual "one more nudge, right now" trigger — distinct from the daily cron sweep. The cron skips
// anyone whose survey has expired (Admin -> Survey Automation -> Reminders) and only nudges once
// per calendar day, both deliberately to avoid pestering people automatically. An admin explicitly
// clicking this button means "remind literally everyone still outstanding, even the expired
// ones, right now" — so it passes force:true through to sendSurveyReminders to bypass both.
export async function POST(_req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const [schedules, settings] = await Promise.all([
      prisma.trainingSchedule.findMany({ include: { attendees: true } }),
      prisma.surveySettings.findFirst(),
    ])
    const reminderSettings = {
      expiryEnabled: settings?.expiryEnabled ?? true,
      expiryDays: settings?.expiryDays ?? 7,
      excludeDefaultCcOnReminders: settings?.excludeDefaultCcOnReminders ?? true,
    }

    let sent = 0
    const skipped: { staffName: string; reason: string }[] = []
    const errors: { scheduleId: string; stage: SurveyStage; message: string }[] = []

    for (const schedule of schedules) {
      for (const stage of STAGES) {
        try {
          const result = await sendSurveyReminders(schedule, stage, reminderSettings, { force: true })
          sent += result.sent
          skipped.push(...result.skipped)
        } catch (err) {
          errors.push({ scheduleId: schedule.id, stage, message: err instanceof Error ? err.message : 'Failed to send reminder.' })
        }
      }
    }

    return NextResponse.json({ sent, skipped, errors })
  } catch (err) {
    console.error('[admin/training-schedule/send-reminders-all POST]', err)
    return NextResponse.json({ error: 'Failed to send reminders.' }, { status: 500 })
  }
}
