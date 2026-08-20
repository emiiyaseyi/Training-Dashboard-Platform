import { prisma } from '@/lib/prisma'
import { DEFAULT_QUESTIONS, type DefaultQuestion } from '@/lib/default-survey-questions'

export type SurveyStageKey = 'pre' | 'post1' | 'post2'

export async function getStageQuestions(stage: SurveyStageKey) {
  const existing = await prisma.surveyQuestion.findMany({
    where: { stage },
    orderBy: { order: 'asc' },
  })
  if (existing.length > 0) return existing

  const defaults = DEFAULT_QUESTIONS[stage]
  await prisma.surveyQuestion.createMany({
    data: defaults.map((q: DefaultQuestion, i: number) => ({
      stage,
      order: i,
      section: q.section || null,
      label: q.label,
      type: q.type,
      options: q.options ? JSON.stringify(q.options) : null,
      required: q.required,
      autoFill: q.autoFill || null,
      fieldKey: q.fieldKey || null,
    })),
  })
  return prisma.surveyQuestion.findMany({ where: { stage }, orderBy: { order: 'asc' } })
}
