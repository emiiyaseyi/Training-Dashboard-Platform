import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MONTHS } from '@/lib/filter-types'
import type { SurveyStageKey } from '@/lib/survey-questions'
import { isSurveyExpired } from '@/lib/survey-expiry'
import { mirrorSurveyResponse } from '@/lib/survey-mirror'

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

function currentMonthName(): string {
  return MONTHS[new Date().getMonth()]
}

async function getOrCreateNativeBatch(type: string, filename: string) {
  const existing = await prisma.uploadBatch.findFirst({ where: { type, filename } })
  if (existing) return existing
  return prisma.uploadBatch.create({ data: { type, filename, recordCount: 0 } })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string; stage: string }> }) {
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

    const questions = await prisma.surveyQuestion.findMany({ where: { stage: stageKey }, orderBy: { order: 'asc' } })

    // Validate required questions (skip auto-filled ones — those aren't asked of the respondent).
    const missing = questions.filter((q) => q.required && !q.autoFill && !answers[q.id]?.toString().trim())
    if (missing.length > 0) {
      return NextResponse.json({ error: `Please answer: ${missing.map((q) => q.label).join(', ')}` }, { status: 400 })
    }

    const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v || '')
    const asNumber = (v: string | string[] | undefined) => {
      const n = parseFloat(Array.isArray(v) ? '' : v || '')
      return isNaN(n) ? 0 : n
    }
    const fieldAnswer = (fieldKey: string) => {
      const q = questions.find((q) => q.fieldKey === fieldKey)
      return q ? answers[q.id] : undefined
    }

    // Save the raw, full-fidelity answer set regardless of stage.
    const response = await prisma.surveyResponse.create({
      data: { attendeeId: attendee.id, stage: stageKey, answers: JSON.stringify(answers) },
    })
    await prisma.trainingScheduleAttendee.update({
      where: { id: attendee.id },
      data: { [RESPONDED_FIELD[stageKey]]: new Date() },
    })

    // Feed the structured metric this stage maps to.
    if (stageKey === 'post1') {
      const batch = await getOrCreateNativeBatch('feedback', 'Native Survey Responses (Post-1)')
      await prisma.feedbackRecord.create({
        data: {
          businessUnit: attendee.schedule.businessUnit,
          trainingTitle: attendee.schedule.trainingName,
          role: null,
          applicationResponse: asText(fieldAnswer('applicationResponse')),
          impactAlignment: asText(fieldAnswer('impactAlignment')),
          confidenceRating: asNumber(fieldAnswer('confidenceRating')),
          roleRelevance: asNumber(fieldAnswer('roleRelevance')),
          expectationsMet: asNumber(fieldAnswer('expectationsMet')),
          vendorRating: asNumber(fieldAnswer('vendorRating')),
          vendorName: asText(fieldAnswer('vendorName')),
          qualitativeResponse: asText(fieldAnswer('qualitativeResponse')),
          month: currentMonthName(),
          batchId: batch.id,
        },
      })
      await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: 1 } } })
    } else if (stageKey === 'post2') {
      const batch = await getOrCreateNativeBatch('manager-review', 'Native Survey Responses (Post-2)')
      await prisma.managerReviewRecord.create({
        data: {
          staffId: attendee.staffId,
          staffName: attendee.staffName,
          businessUnit: attendee.schedule.businessUnit,
          training: attendee.schedule.trainingName,
          managerName: attendee.lineManagerName,
          impactScore: asNumber(fieldAnswer('impactScore')),
          comments: asText(fieldAnswer('comments')) || null,
          month: currentMonthName(),
          batchId: batch.id,
        },
      })
      await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: 1 } } })
    }

    // Best-effort: mirror into the Google Sheet tab. Outcome is persisted on the response itself
    // (not just logged) so a failure is visible to the admin and individually retryable, rather
    // than silently disappearing into server logs nobody sees.
    const mirrorResult = await mirrorSurveyResponse(stageKey, attendee, answers, questions)
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
