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
      id: r.id,
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

  // Post-1/Post-2 answers aren't the ONLY thing that feeds a BU's dashboard score — a
  // FeedbackRecord/ManagerReviewRecord row can also come from a spreadsheet uploaded at
  // /api/upload/manager-review (or the equivalent feedback upload), entirely independent of any
  // survey submission, and the dashboard averages ALL of them together (see analytics.ts). Without
  // this, this panel could show e.g. "3 responses, 4.0 avg" while the dashboard shows 3.5 for the
  // same BU, with no way to tell that's because a 4th, uploaded-only record also counts there —
  // exactly the mismatch that motivated adding this check in the first place. Computed by matching
  // analytics.ts's OWN filter (stored businessUnit === buName) exactly, so this number can never
  // itself drift from what the dashboard shows.
  let dashboardMetric: {
    label: string
    allRecordsCount: number
    allRecordsAverage: number | null
    nativeOnlyCount: number
    nativeOnlyAverage: number | null
    uploadedOrUneditedCount: number
  } | null = null

  if (stage === 'post2') {
    const all = businessUnit === 'all'
      ? await prisma.managerReviewRecord.findMany({ select: { impactScore: true } })
      : await prisma.managerReviewRecord.findMany({ where: { businessUnit }, select: { impactScore: true } })
    const nativeScores = scoped.map((r) => Number(r.answers[questions.find((q) => q.fieldKey === 'impactScore')?.id ?? ''])).filter((n) => !Number.isNaN(n))
    dashboardMetric = {
      label: 'Post-Training Impact',
      allRecordsCount: all.length,
      allRecordsAverage: all.length > 0 ? all.reduce((s, r) => s + r.impactScore, 0) / all.length : null,
      nativeOnlyCount: nativeScores.length,
      nativeOnlyAverage: nativeScores.length > 0 ? nativeScores.reduce((s, n) => s + n, 0) / nativeScores.length : null,
      uploadedOrUneditedCount: Math.max(0, all.length - nativeScores.length),
    }
  } else if (stage === 'post1') {
    const all = businessUnit === 'all'
      ? await prisma.feedbackRecord.findMany({ where: { confidenceRating: { not: null } }, select: { confidenceRating: true } })
      : await prisma.feedbackRecord.findMany({ where: { businessUnit, confidenceRating: { not: null } }, select: { confidenceRating: true } })
    const nativeScores = scoped.map((r) => Number(r.answers[questions.find((q) => q.fieldKey === 'confidenceRating')?.id ?? ''])).filter((n) => !Number.isNaN(n))
    dashboardMetric = {
      label: 'Avg Impact Score',
      allRecordsCount: all.length,
      allRecordsAverage: all.length > 0 ? all.reduce((s, r) => s + (r.confidenceRating ?? 0), 0) / all.length : null,
      nativeOnlyCount: nativeScores.length,
      nativeOnlyAverage: nativeScores.length > 0 ? nativeScores.reduce((s, n) => s + n, 0) / nativeScores.length : null,
      uploadedOrUneditedCount: Math.max(0, all.length - nativeScores.length),
    }
  }

  return NextResponse.json({
    questions: questions.map((q) => ({ id: q.id, section: q.section, label: q.label, type: q.type, options: q.options ? JSON.parse(q.options) : null, ratingMax: q.ratingMax })),
    responses: scoped,
    insights,
    dashboardMetric,
    respondentCount: scoped.length,
    businessUnitCounts: [...businessUnitCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  })
}
