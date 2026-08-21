import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Cross-stage response-rate and qualitative-comment feed for the Survey Insights panel — the
// rating-based metrics (vendor performance, role relevance, etc.) already exist on
// GroupAnalytics and are fetched separately; this route covers what that doesn't: how many sent
// surveys actually came back, and what people wrote in the open-text questions.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const attendees = await prisma.trainingScheduleAttendee.findMany({
      select: {
        preSurveySentAt: true, preSurveyRespondedAt: true,
        post1SurveySentAt: true, post1SurveyRespondedAt: true,
        post2SurveySentAt: true, post2SurveyRespondedAt: true,
      },
    })

    const STAGES = ['pre', 'post1', 'post2'] as const
    const responseRateByStage = STAGES.map((stage) => {
      const sentField = `${stage}SurveySentAt` as const
      const respondedField = `${stage}SurveyRespondedAt` as const
      const sent = attendees.filter((a) => a[sentField]).length
      const responded = attendees.filter((a) => a[respondedField]).length
      return { stage, sent, responded, ratePct: sent > 0 ? (responded / sent) * 100 : 0 }
    })

    const [feedback, managerReviews] = await Promise.all([
      prisma.feedbackRecord.findMany({
        where: { qualitativeResponse: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { businessUnit: true, trainingTitle: true, month: true, qualitativeResponse: true, createdAt: true },
      }),
      prisma.managerReviewRecord.findMany({
        where: { comments: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { businessUnit: true, training: true, staffName: true, month: true, comments: true, createdAt: true },
      }),
    ])

    const comments = [
      ...feedback
        .filter((f) => f.qualitativeResponse?.trim())
        .map((f) => ({
          source: 'Post-1 (Employee)',
          businessUnit: f.businessUnit,
          training: f.trainingTitle,
          staffName: null as string | null,
          text: f.qualitativeResponse!,
          date: f.createdAt,
        })),
      ...managerReviews
        .filter((m) => m.comments?.trim())
        .map((m) => ({
          source: 'Post-2 (Manager)',
          businessUnit: m.businessUnit,
          training: m.training,
          staffName: m.staffName,
          text: m.comments!,
          date: m.createdAt,
        })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 100)

    return NextResponse.json({ responseRateByStage, comments })
  } catch (err) {
    console.error('[admin/survey-insights GET]', err)
    return NextResponse.json({ error: 'Failed to compute survey insights.' }, { status: 500 })
  }
}
