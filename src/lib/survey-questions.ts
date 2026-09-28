import { prisma } from '@/lib/prisma'
import { DEFAULT_QUESTIONS, type DefaultQuestion } from '@/lib/default-survey-questions'

export type SurveyStageKey = 'pre' | 'post1' | 'post2'

export type ExcludedQuestionIds = Partial<Record<SurveyStageKey, string[]>>

// TrainingSchedule.excludedQuestionIds is stored as one JSON blob covering all three stages —
// parsed defensively since it's free-form text in the DB (blank/malformed = nothing excluded,
// never a crash).
export function parseExcludedQuestionIds(raw: string | null | undefined): ExcludedQuestionIds {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// The question bank (SurveyQuestion) is shared/global across every schedule — this is what
// actually makes an exclusion "per schedule": filters that shared list down to what THIS
// schedule's respondents should see, without touching the underlying bank for anyone else.
export function excludeQuestions<T extends { id: string }>(questions: T[], excludedIds: string[] | undefined): T[] {
  if (!excludedIds || excludedIds.length === 0) return questions
  const excluded = new Set(excludedIds)
  return questions.filter((q) => !excluded.has(q.id))
}

export async function getStageQuestions(stage: SurveyStageKey) {
  const existing = await prisma.surveyQuestion.findMany({
    where: { stage },
    orderBy: { order: 'asc' },
  })

  if (existing.length === 0) {
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
        driveFolderId: q.driveFolderId || null,
      })),
    })
    return prisma.surveyQuestion.findMany({ where: { stage }, orderBy: { order: 'asc' } })
  }

  // Backfill: a stage already seeded before the file-upload questions were added never gets them
  // through the empty-table check above — so separately ensure those specific defaults are
  // present by label, appending any that are missing. Scoped to type "file" only, not every
  // default question, since an admin may have intentionally deleted some other default question
  // and re-adding it behind their back would be wrong.
  const existingLabels = new Set(existing.map((q) => q.label))
  const missing = DEFAULT_QUESTIONS[stage].filter((q) => q.type === 'file' && !existingLabels.has(q.label))
  if (missing.length > 0) {
    const maxOrder = existing.reduce((max, q) => Math.max(max, q.order), -1)
    await prisma.surveyQuestion.createMany({
      data: missing.map((q, i) => ({
        stage,
        order: maxOrder + 1 + i,
        section: q.section || null,
        label: q.label,
        type: q.type,
        options: q.options ? JSON.stringify(q.options) : null,
        required: q.required,
        autoFill: q.autoFill || null,
        fieldKey: q.fieldKey || null,
        driveFolderId: q.driveFolderId || null,
      })),
    })
    return prisma.surveyQuestion.findMany({ where: { stage }, orderBy: { order: 'asc' } })
  }

  return existing
}
