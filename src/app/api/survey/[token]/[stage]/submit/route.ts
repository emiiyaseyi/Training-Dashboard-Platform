import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { excludeQuestions, parseExcludedQuestionIds, type SurveyStageKey } from '@/lib/survey-questions'
import { isSurveyExpired } from '@/lib/survey-expiry'
import { mirrorSurveyResponse } from '@/lib/survey-mirror'
import { rateLimit } from '@/lib/rate-limit'
import { upsertStructuredRecordForResponse } from '@/lib/survey-structured-sync'

const VALID_STAGES: SurveyStageKey[] = ['pre', 'post1', 'post2']

const RESPONDED_FIELD = {
  pre: 'preSurveyRespondedAt',
  post1: 'post1SurveyRespondedAt',
  post2: 'post2SurveyRespondedAt',
} as const

const SENT_FIELD = {
  pre: 'preSurveySentAt',
  post1: 'post1SurveySentAt',
  post2: 'post2SurveySentAt',
} as const

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; stage: string }> }) {
  const limited = rateLimit(req, 'survey-submit', 20, 60_000)
  if (limited) return limited

  try {
    const { token, stage } = await params
    if (!VALID_STAGES.includes(stage as SurveyStageKey)) {
      return NextResponse.json({ error: 'Unknown survey stage.' }, { status: 400 })
    }
    const stageKey = stage as SurveyStageKey

    const attendee = await prisma.trainingScheduleAttendee.findUnique({
      where: { surveyToken: token },
      include: { schedule: true },
    })
    if (!attendee) return NextResponse.json({ error: 'This survey link is invalid or has expired.' }, { status: 404 })
    if (attendee[RESPONDED_FIELD[stageKey]]) {
      return NextResponse.json({ error: 'This survey has already been submitted.' }, { status: 400 })
    }
    if (await isSurveyExpired(attendee[SENT_FIELD[stageKey]])) {
      return NextResponse.json({ error: 'This survey has expired and can no longer accept responses.' }, { status: 400 })
    }

    const { answers } = (await req.json()) as { answers: Record<string, string | string[]> }

    const allQuestions = await prisma.surveyQuestion.findMany({ where: { stage: stageKey }, orderBy: { order: 'asc' } })
    const excluded = parseExcludedQuestionIds(attendee.schedule.excludedQuestionIds)
    const questions = excludeQuestions(allQuestions, excluded[stageKey])

    // Validate required questions (skip auto-filled ones — those aren't asked of the respondent).
    const missing = questions.filter((q) => q.required && !q.autoFill && !answers[q.id]?.toString().trim())
    if (missing.length > 0) {
      return NextResponse.json({ error: `Please answer: ${missing.map((q) => q.label).join(', ')}` }, { status: 400 })
    }

    // Save the raw, full-fidelity answer set regardless of stage.
    const response = await prisma.surveyResponse.create({
      data: { attendeeId: attendee.id, stage: stageKey, answers: JSON.stringify(answers) },
    })
    await prisma.trainingScheduleAttendee.update({
      where: { id: attendee.id },
      data: { [RESPONDED_FIELD[stageKey]]: new Date() },
    })

    // Feed the structured metric this stage maps to (FeedbackRecord for post1, ManagerReviewRecord
    // for post2) — shared with the admin response editor so a later correction recomputes the same
    // way a fresh submission does.
    if (stageKey === 'post1' || stageKey === 'post2') {
      await upsertStructuredRecordForResponse(stageKey, attendee, answers, questions, response.id)
    }

    // Best-effort: mirror into the Google Sheet tab. Outcome is persisted on the response itself
    // (not just logged) so a failure is visible to the admin and individually retryable, rather
    // than silently disappearing into server logs nobody sees.
    const mirrorResult = await mirrorSurveyResponse(stageKey, attendee, answers, questions, response.submittedAt)
    if (mirrorResult.attempted) {
      await prisma.surveyResponse.update({
        where: { id: response.id },
        data: { mirrorSyncedAt: mirrorResult.success ? new Date() : null, mirrorError: mirrorResult.success ? null : mirrorResult.message },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[survey submit]', err)
    return NextResponse.json({ error: 'Failed to submit — please try again.' }, { status: 500 })
  }
}
