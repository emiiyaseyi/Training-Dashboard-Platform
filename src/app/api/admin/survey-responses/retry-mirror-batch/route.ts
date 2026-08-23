import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { mirrorSurveyResponses, type MirrorBatchItem } from '@/lib/survey-mirror'
import type { SurveyStageKey } from '@/lib/survey-questions'

// Batch sibling of the per-response retry route — retrying N unsynced responses one at a time
// meant N separate connect+read-headers+append round trips (the auto-retry-on-load in
// SurveyResponseMirrorPanel ran this on every page visit), which is what made that panel slow to
// resolve and, cumulatively, part of what made the whole Survey Automation page feel slow.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { ids } = await req.json() as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Provide at least one response id.' }, { status: 400 })
    }

    const responses = await prisma.surveyResponse.findMany({
      where: { id: { in: ids } },
      include: { attendee: { include: { schedule: true } } },
    })

    const stagesPresent = [...new Set(responses.map((r) => r.stage))] as SurveyStageKey[]
    const questionsByStage = new Map<SurveyStageKey, Awaited<ReturnType<typeof prisma.surveyQuestion.findMany>>>()
    await Promise.all(stagesPresent.map(async (stage) => {
      questionsByStage.set(stage, await prisma.surveyQuestion.findMany({ where: { stage }, orderBy: { order: 'asc' } }))
    }))

    const items: MirrorBatchItem[] = responses.map((r) => ({
      responseId: r.id,
      stageKey: r.stage as SurveyStageKey,
      attendee: r.attendee,
      answers: JSON.parse(r.answers) as Record<string, string | string[]>,
      questions: questionsByStage.get(r.stage as SurveyStageKey) || [],
    }))

    const results = await mirrorSurveyResponses(items)

    await Promise.all(
      responses.map((r) => {
        const result = results.get(r.id)
        if (!result?.attempted) return null
        return prisma.surveyResponse.update({
          where: { id: r.id },
          data: { mirrorSyncedAt: result.success ? new Date() : null, mirrorError: result.success ? null : result.message },
        })
      })
    )

    return NextResponse.json({ results: Object.fromEntries(results) })
  } catch (err) {
    console.error('[admin/survey-responses/retry-mirror-batch POST]', err)
    return NextResponse.json({ error: 'Failed to retry mirror sync.' }, { status: 500 })
  }
}
