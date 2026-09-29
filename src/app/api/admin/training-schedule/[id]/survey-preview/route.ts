import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { getStageQuestions, excludeQuestions, parseExcludedQuestionIds, type SurveyStageKey } from '@/lib/survey-questions'

const VALID_STAGES: SurveyStageKey[] = ['pre', 'post1', 'post2']

// Admin-only, read-only preview of a schedule's Pre/Post-1/Post-2 form — same "questions" shape
// the live respondent-facing /api/survey/[token]/[stage] route returns, minus anything
// respondent-specific (token, recipient, response state), since this is never actually submitted.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const stage = req.nextUrl.searchParams.get('stage') as SurveyStageKey | null
  if (!stage || !VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Unknown survey stage.' }, { status: 400 })
  }

  const schedule = await prisma.trainingSchedule.findUnique({ where: { id } })
  if (!schedule) return NextResponse.json({ error: 'Training schedule not found.' }, { status: 404 })

  const allQuestions = await getStageQuestions(stage)
  const excluded = parseExcludedQuestionIds(schedule.excludedQuestionIds)
  const questions = excludeQuestions(allQuestions, excluded[stage])

  return NextResponse.json({
    trainingName: schedule.trainingName,
    businessUnit: schedule.businessUnit,
    stage,
    questions: questions.map((q) => ({
      id: q.id,
      section: q.section,
      label: q.label,
      type: q.type,
      options: q.options ? JSON.parse(q.options) : null,
      ratingMax: q.ratingMax,
      required: q.required,
    })),
  })
}
