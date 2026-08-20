import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { mirrorSurveyResponse } from '@/lib/survey-mirror'
import type { SurveyStageKey } from '@/lib/survey-questions'

// Re-runs the Google Sheet mirror for one already-saved response — does NOT re-create its
// FeedbackRecord/ManagerReviewRecord or ask the respondent to fill the form again, since the
// database write already succeeded; only the sheet-side append is retried.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const response = await prisma.surveyResponse.findUnique({
    where: { id },
    include: { attendee: { include: { schedule: true } } },
  })
  if (!response) return NextResponse.json({ error: 'Survey response not found.' }, { status: 404 })

  const stageKey = response.stage as SurveyStageKey
  const questions = await prisma.surveyQuestion.findMany({ where: { stage: stageKey }, orderBy: { order: 'asc' } })
  const answers = JSON.parse(response.answers) as Record<string, string | string[]>

  const result = await mirrorSurveyResponse(stageKey, response.attendee, answers, questions)
  await prisma.surveyResponse.update({
    where: { id: response.id },
    data: { mirrorSyncedAt: result.success ? new Date() : null, mirrorError: result.success ? null : result.message },
  })

  return NextResponse.json(result)
}
