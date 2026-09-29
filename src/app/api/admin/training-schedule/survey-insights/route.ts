import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { getStageQuestions, type SurveyStageKey } from '@/lib/survey-questions'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'

const VALID_STAGES: SurveyStageKey[] = ['pre', 'post1', 'post2']

interface QuestionInsight {
  questionId: string
  label: string
  type: string
  responseCount: number
  average?: number
  distribution?: { option: string; count: number }[]
}

// Group-wide (all schedules, not just one) Responses + Insights for a survey stage, filterable by
// Business Unit — built so an admin can verify a reported aggregate (e.g. "Post-Training Impact
// 2.0/5" on a Business Unit's report card) against the actual individual submissions that fed it,
// rather than having to trust the number. Business Unit here is the attendee's OWN CURRENT roster
// BU (same resolution the live survey form and mirror use — see survey/[token]/[stage] route),
// not the training schedule's shared BU, since that's what a report card's per-BU breakdown means
// and what was previously found to drift out of sync for mixed-BU trainings.
export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const stage = req.nextUrl.searchParams.get('stage') as SurveyStageKey | null
  if (!stage || !VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Unknown survey stage.' }, { status: 400 })
  }
  const businessUnit = req.nextUrl.searchParams.get('businessUnit') || 'all'

  const responses = await prisma.surveyResponse.findMany({
    where: { stage },
    orderBy: { submittedAt: 'desc' },
    include: { attendee: { include: { schedule: { select: { trainingName: true, businessUnit: true } } } } },
  })

  const directory = await loadRosterDirectory()

  const enriched = responses.map((r) => {
    const attendee = r.attendee
    const staff = resolveStaff(attendee.staffId, directory)
    const resolvedBusinessUnit = staff?.businessUnit || attendee.schedule.businessUnit
    let parsed: Record<string, string | string[]> = {}
    try { parsed = JSON.parse(r.answers) } catch { /* corrupted row, treat as no answers */ }
    return {
      attendeeId: attendee.id,
      staffId: attendee.staffId,
      staffName: attendee.staffName,
      businessUnit: resolvedBusinessUnit,
      trainingName: attendee.schedule.trainingName,
      submittedAt: r.submittedAt.toISOString(),
      answers: parsed,
    }
  })

  const scoped = businessUnit === 'all' ? enriched : enriched.filter((r) => r.businessUnit === businessUnit)

  const questions = await getStageQuestions(stage)
  const insights: QuestionInsight[] = questions.map((q) => {
    const values = scoped.map((r) => r.answers[q.id]).filter((v) => v !== undefined && v !== null && v !== '')
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

  const businessUnitCounts = new Map<string, number>()
  for (const r of enriched) businessUnitCounts.set(r.businessUnit, (businessUnitCounts.get(r.businessUnit) || 0) + 1)

  return NextResponse.json({
    questions: questions.map((q) => ({ id: q.id, section: q.section, label: q.label, type: q.type })),
    responses: scoped,
    insights,
    respondentCount: scoped.length,
    businessUnitCounts: [...businessUnitCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  })
}
