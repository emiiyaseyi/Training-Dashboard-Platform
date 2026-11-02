import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSurveyStage, sendSurveyReminders } from '@/lib/survey-send'
import type { SurveyStage } from '@/lib/survey-email'
import { sendCronFailureAlert } from '@/lib/cron-alert'
import { sendCustomSurveyReminders } from '@/lib/custom-survey'
import { sendPDPReminders } from '@/lib/pdp-send'
import { syncNewHireExperienceSurveys, sendDueNewHireExperienceSurveys, sendNewHireExperienceSurveyReminders } from '@/lib/new-hire-survey'

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
  // Fail closed: this route sits outside middleware's session check (see middleware.ts), so an
  // unset CRON_SECRET would otherwise leave it publicly invokable by anyone who knows the URL.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured on the server.' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const now = Date.now()
  const [schedules, settings] = await Promise.all([
    prisma.trainingSchedule.findMany({ include: { attendees: true } }),
    prisma.surveySettings.findFirst(),
  ])
  const preDaysBefore = settings?.preDaysBefore ?? 30
  const post1DaysAfter = settings?.post1DaysAfter ?? 1
  const post2DaysAfter = settings?.post2DaysAfter ?? 30
  const reminderSettings = {
    expiryEnabled: settings?.expiryEnabled ?? true,
    expiryDays: settings?.expiryDays ?? 7,
    preReminderIntervalDays: settings?.preReminderIntervalDays ?? 7,
    excludeDefaultCcOnReminders: settings?.excludeDefaultCcOnReminders ?? true,
  }

  const results: { scheduleId: string; trainingName: string; stage: SurveyStage; sent: number; skipped: number; reminder?: boolean }[] = []
  const errors: { scheduleId: string; stage: SurveyStage; message: string }[] = []
  const STAGES: SurveyStage[] = ['pre', 'post1', 'post2']

  for (const schedule of schedules) {
    const daysUntilStart = (schedule.startDate.getTime() - now) / DAY_MS
    const daysSinceEnd = (now - schedule.endDate.getTime()) / DAY_MS

    const due: SurveyStage[] = []
    if (daysUntilStart <= preDaysBefore && daysUntilStart >= -3 && schedule.preEnabled) due.push('pre')
    if (daysSinceEnd >= post1DaysAfter && schedule.post1Enabled) due.push('post1')
    if (daysSinceEnd >= post2DaysAfter && schedule.post2Enabled) due.push('post2')

    for (const stage of due) {
      const hasUnsent = schedule.attendees.some((a) => {
        if (stage === 'pre') return !a.preSurveySentAt
        if (stage === 'post1') return !a.post1SurveySentAt
        return !a.post2SurveySentAt
      })
      if (!hasUnsent) continue

      try {
        const result = await sendSurveyStage(schedule.id, stage, undefined, true, false, schedule.skipLineManagerCc)
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

  // Third sweep: PDP reminders (Track A self-fill, Track A manager validations, Track B manager
  // team-fill) — same calendar-day cadence as everything above. A failure here shouldn't block
  // either of the sweeps already run, so it's wrapped and reported the same way as the others.
  let pdpResult: { sent: number } = { sent: 0 }
  let pdpError: string | null = null
  try {
    pdpResult = await sendPDPReminders()
  } catch (err) {
    pdpError = err instanceof Error ? err.message : 'Failed to send PDP reminders.'
  }

  // Fourth sweep: Talent Acquisition's New Hire Experience Survey — sync newly-accepted hires
  // from the Hires sheet (matching each to a staff record), send any now-due (join date + 7
  // days), then nudge anyone outstanding. Same wrap-and-report pattern as the PDP sweep above.
  let newHireResult: { created: number; unmatched: number; sent: number; reminded: number } = { created: 0, unmatched: 0, sent: 0, reminded: 0 }
  let newHireError: string | null = null
  try {
    const syncResult = await syncNewHireExperienceSurveys()
    const sendResult = await sendDueNewHireExperienceSurveys()
    const reminderResult = await sendNewHireExperienceSurveyReminders()
    newHireResult = { created: syncResult.created, unmatched: syncResult.unmatched.length, sent: sendResult.sent, reminded: reminderResult.sent }
  } catch (err) {
    newHireError = err instanceof Error ? err.message : 'Failed to sync/send New Hire Experience Surveys.'
  }

  await sendCronFailureAlert(
    'Survey send/reminder',
    [
      ...errors.map((e) => `Schedule ${e.scheduleId} (${e.stage}): ${e.message}`),
      ...customErrors.map((e) => `Custom Survey "${e.title}": ${e.message}`),
      ...(pdpError ? [`PDP reminders: ${pdpError}`] : []),
      ...(newHireError ? [`New Hire Experience Survey: ${newHireError}`] : []),
    ]
  )

  return NextResponse.json({
    success: errors.length === 0 && customErrors.length === 0 && !pdpError && !newHireError,
    results, errors, customResults, customErrors, pdpResult, pdpError, newHireResult, newHireError,
  })
}
