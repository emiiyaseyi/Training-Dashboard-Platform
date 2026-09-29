import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { excludeQuestions, parseExcludedQuestionIds, type SurveyStageKey } from '@/lib/survey-questions'
import { upsertStructuredRecordForResponse } from '@/lib/survey-structured-sync'

// Admin correction of an already-submitted Pre/Post-1/Post-2 survey response — e.g. a respondent
// misread a rating question, or an admin needs to fix a typo'd free-text answer. Requires 'admin'
// (not just 'view') since this changes data that feeds the dashboard, not just what's displayed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ responseId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { responseId } = await params
  const { answers } = (await req.json()) as { answers?: Record<string, string | string[]> }
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'answers is required.' }, { status: 400 })
  }

  const response = await prisma.surveyResponse.findUnique({
    where: { id: responseId },
    include: { attendee: { include: { schedule: true } } },
  })
  if (!response) return NextResponse.json({ error: 'Response not found.' }, { status: 404 })

  const stageKey = response.stage as SurveyStageKey
  const allQuestions = await prisma.surveyQuestion.findMany({ where: { stage: stageKey }, orderBy: { order: 'asc' } })
  const excluded = parseExcludedQuestionIds(response.attendee.schedule.excludedQuestionIds)
  const questions = excludeQuestions(allQuestions, excluded[stageKey])

  await prisma.surveyResponse.update({ where: { id: responseId }, data: { answers: JSON.stringify(answers) } })

  // Post-1/Post-2 answers feed a structured FeedbackRecord/ManagerReviewRecord row — that row, not
  // the raw answers JSON, is what the dashboard's analytics actually read, so the edit has to reach
  // it too or the report stays showing the old number.
  if (stageKey === 'post1' || stageKey === 'post2') {
    await upsertStructuredRecordForResponse(stageKey, response.attendee, answers, questions, response.id)
  }

  // The Google Sheet mirror (when configured) only supports appending new rows, not locating and
  // updating one already-written row for an individual response — so an edit here does NOT touch
  // the sheet. The database (and therefore the dashboard) is the source of truth for this response
  // either way.
  return NextResponse.json({ success: true })
}
