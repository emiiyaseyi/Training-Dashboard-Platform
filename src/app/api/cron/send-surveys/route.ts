import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSurveyStage, sendSurveyReminders } from '@/lib/survey-send'
import type { SurveyStage } from '@/lib/survey-email'
import { sendCronFailureAlert } from '@/lib/cron-alert'
import { sendCustomSurveyReminders } from '@/lib/custom-survey'

const DAY_MS = 86400000

// Runs daily (see vercel.json). For each training schedule, works out which stages are due —
// timing is admin-configurable (Admin → Survey Automation → Send Timing), defaulting to:
// Pre: from N days before start through 3 days after (grace window in case a run is missed).
// Post-1: from N days after the end date onward.
// Post-2: from N days after the end date onward.
// sendSurveyStage(..., onlyUnsent: true) makes this idempotent — attendees who already have a
// stage's timestamp set are skipped, so running this every day never re-sends to anyone, and a
// newly-added attendee on an already-due schedule gets caught up automatically next run.
//
// After the initial-send pass, a second pass nudges anyone already sent a stage who hasn't
// responded yet (Admin → Survey Automation → Reminders), stopping once their survey expires.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }
  }

  const now = Date.now()
  const [schedules, settings] = await Promise.all([
    prisma.trainingSchedule.findMany({ include: { attendees: true } }),
    prisma.surveySettings.findFirst(),
  ])
  const preDaysBefore = settings?.preDaysBefore ?? 7
  const post1DaysAfter = settings?.post1DaysAfter ?? 1
  const post2DaysAfter = settings?.post2DaysAfter ?? 30
  const reminderSettings = {
    expiryEnabled: settings?.expiryEnabled ?? true,
    expiryDays: settings?.expiryDays ?? 7,
  }

  const results: { scheduleId: string; trainingName: string; stage: SurveyStage; sent: number; skipped: number; reminder?: boolean }[] = []
  const errors: { scheduleId: string; stage: SurveyStage; message: string }[] = []
  const STAGES: SurveyStage[] = ['pre', 'post1', 'post2']

  for (const schedule of schedules) {
    const daysUntilStart = (schedule.startDate.getTime() - now) / DAY_MS
    const daysSinceEnd = (now - schedule.endDate.getTime()) / DAY_MS

    const due: SurveyStage[] = []
    if (daysUntilStart <= preDaysBefore && daysUntilStart >= -3) due.push('pre')
    if (daysSinceEnd >= post1DaysAfter) due.push('post1')
    if (daysSinceEnd >= post2DaysAfter) due.push('post2')

    for (const stage of due) {
      const hasUnsent = schedule.attendees.some((a) => {
        if (stage === 'pre') return !a.preSurveySentAt
        if (stage === 'post1') return !a.post1SurveySentAt
        return !a.post2SurveySentAt
      })
      if (!hasUnsent) continue

      try {
        const result = await sendSurveyStage(schedule.id, stage, undefined, true)
        if (result.sent > 0 || result.skipped.length > 0) {
          results.push({ scheduleId: schedule.id, trainingName: schedule.trainingName, stage, sent: result.sent, skipped: result.skipped.length })
        }
      } catch (err) {
        errors.push({ scheduleId: schedule.id, stage, message: err instanceof Error ? err.message : 'Failed to send.' })
      }
    }

    for (const stage of STAGES) {
      try {
        const result = await sendSurveyReminders(schedule, stage, reminderSettings)
        if (result.sent > 0 || result.skipped.length > 0) {
          results.push({ scheduleId: schedule.id, trainingName: schedule.trainingName, stage, sent: result.sent, skipped: result.skipped.length, reminder: true })
        }
      } catch (err) {
        errors.push({ scheduleId: schedule.id, stage, message: err instanceof Error ? err.message : 'Failed to send reminder.' })
      }
    }
  }

  // Second sweep, independent of training schedules: nudge Custom Survey recipients who've been
  // sent a survey but haven't responded yet. Reuses the exact same daily-calendar-day cadence as
  // the training surveys' reminder sweep above (see sendCustomSurveyReminders).
  const customSurveys = await prisma.customSurvey.findMany({
    where: { status: 'launched' },
    include: { recipients: true },
  })
  const customResults: { surveyId: string; title: string; sent: number; skipped: number }[] = []
  const customErrors: { surveyId: string; title: string; message: string }[] = []
  for (const survey of customSurveys) {
    try {
      const result = await sendCustomSurveyReminders(survey)
      if (result.sent > 0 || result.skipped.length > 0) {
        customResults.push({ surveyId: survey.id, title: survey.title, sent: result.sent, skipped: result.skipped.length })
      }
    } catch (err) {
      customErrors.push({ surveyId: survey.id, title: survey.title, message: err instanceof Error ? err.message : 'Failed to send custom survey reminder.' })
    }
  }

  await sendCronFailureAlert(
    'Survey send/reminder',
    [
      ...errors.map((e) => `Schedule ${e.scheduleId} (${e.stage}): ${e.message}`),
      ...customErrors.map((e) => `Custom Survey "${e.title}": ${e.message}`),
    ]
  )

  return NextResponse.json({
    success: errors.length === 0 && customErrors.length === 0,
    results, errors, customResults, customErrors,
  })
}
