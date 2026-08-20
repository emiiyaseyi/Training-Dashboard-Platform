import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSurveyStage } from '@/lib/survey-send'
import type { SurveyStage } from '@/lib/survey-email'

const DAY_MS = 86400000

// Runs daily (see vercel.json). For each training schedule, works out which stages are due —
// Pre: from 7 days before start through 3 days after (grace window in case a run is missed).
// Post-1: from 1 day after the end date onward.
// Post-2: from 30 days after the end date onward.
// sendSurveyStage(..., onlyUnsent: true) makes this idempotent — attendees who already have a
// stage's timestamp set are skipped, so running this every day never re-sends to anyone, and a
// newly-added attendee on an already-due schedule gets caught up automatically next run.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }
  }

  const now = Date.now()
  const schedules = await prisma.trainingSchedule.findMany({ include: { attendees: true } })

  const results: { scheduleId: string; trainingName: string; stage: SurveyStage; sent: number; skipped: number }[] = []
  const errors: { scheduleId: string; stage: SurveyStage; message: string }[] = []

  for (const schedule of schedules) {
    const daysUntilStart = (schedule.startDate.getTime() - now) / DAY_MS
    const daysSinceEnd = (now - schedule.endDate.getTime()) / DAY_MS

    const due: SurveyStage[] = []
    if (daysUntilStart <= 7 && daysUntilStart >= -3) due.push('pre')
    if (daysSinceEnd >= 1) due.push('post1')
    if (daysSinceEnd >= 30) due.push('post2')

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
  }

  return NextResponse.json({ success: errors.length === 0, results, errors })
}
