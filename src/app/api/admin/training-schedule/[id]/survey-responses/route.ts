import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { getStageQuestions, excludeQuestions, parseExcludedQuestionIds, type SurveyStageKey } from '@/lib/survey-questions'

const VALID_STAGES: SurveyStageKey[] = ['pre', 'post1', 'post2']

interface QuestionInsight {
  questionId: string
  label: string
  type: string
  responseCount: number
  average?: number // rating questions only
  distribution?: { option: string; count: number }[] // select/multiselect/yesno only
}

// Per-stage Responses + Insights for a training schedule — the same "one submission per person,
// see what everyone said" view CustomSurveyPanel already has, applied here to the fixed pre/post1/
// post2 question set instead of a freeform Custom Survey's own questions.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const stage = req.nextUrl.searchParams.get('stage') as SurveyStageKey | null
  if (!stage || !VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Unknown survey stage.' }, { status: 400 })
  }

  const schedule = await prisma.trainingSchedule.findUnique({
    where: { id },
    include: { attendees: { select: { id: true, staffId: true, staffName: true } } },
  })
  if (!schedule) return NextResponse.json({ error: 'Training schedule not found.' }, { status: 404 })

  const allQuestions = await getStageQuestions(stage)
  const excluded = parseExcludedQuestionIds(schedule.excludedQuestionIds)
  const questions = excludeQuestions(allQuestions, excluded[stage])

  const attendeeIds = schedule.attendees.map((a) => a.id)
  const attendeeById = new Map(schedule.attendees.map((a) => [a.id, a]))
  const rows = attendeeIds.length > 0
    ? await prisma.surveyResponse.findMany({ where: { attendeeId: { in: attendeeIds }, stage }, orderBy: { submittedAt: 'desc' } })
    : []

  const responses = rows.map((r) => {
    const attendee = attendeeById.get(r.attendeeId)
    let parsed: Record<string, string | string[]> = {}
    try { parsed = JSON.parse(r.answers) } catch { /* corrupted row, treat as no answers */ }
    return {
      attendeeId: r.attendeeId,
      staffId: attendee?.staffId ?? '',
      staffName: attendee?.staffName ?? 'Unknown',
      submittedAt: r.submittedAt.toISOString(),
      answers: parsed,
    }
  })

  const insights: QuestionInsight[] = questions.map((q) => {
    const values = responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined && v !== null && v !== '')
    const base = { questionId: q.id, label: q.label, type: q.type, responseCount: values.length }

    if (q.type === 'rating') {
      const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n))
      return { ...base, average: nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : undefined }
    }
    if (q.type === 'select' || q.type === 'yesno' || q.type === 'multiselect') {
      const counts = new Map<string, number>()
      for (const v of values) {
        const opts = Array.isArray(v) ? v : [v]
        for (const o of opts) counts.set(o, (counts.get(o) || 0) + 1)
      }
      return { ...base, distribution: [...counts.entries()].map(([option, count]) => ({ option, count })).sort((a, b) => b.count - a.count) }
    }
    return base
  }).filter((i) => i.type === 'rating' || i.type === 'select' || i.type === 'yesno' || i.type === 'multiselect')

  return NextResponse.json({
    questions: questions.map((q) => ({ id: q.id, section: q.section, label: q.label, type: q.type, options: q.options ? JSON.parse(q.options) : null })),
    responses,
    insights,
    respondentCount: responses.length,
    attendeeCount: schedule.attendees.length,
  })
}
