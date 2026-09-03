import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Admin-only — unlike the public /api/custom-survey/[token] route this deliberately has no
// token/recipient concept at all, since a draft survey has no recipients yet to issue one to.
// Works for any status (draft/launched/closed) so the admin can sanity-check wording before
// launching, or re-check it any time after.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.customSurvey.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: 'asc' } } },
  })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })

  return NextResponse.json({
    title: survey.title,
    description: survey.description,
    status: survey.status,
    displayMode: survey.displayMode,
    questions: survey.questions.map((q) => ({
      id: q.id,
      section: q.section,
      label: q.label,
      description: q.description,
      type: q.type,
      options: q.options ? (JSON.parse(q.options) as string[]) : null,
      ratingMax: q.ratingMax,
      required: q.required,
      gatesSection: q.gatesSection,
      skipSectionIfValues: q.skipSectionIfValues ? (JSON.parse(q.skipSectionIfValues) as string[]) : null,
    })),
  })
}
