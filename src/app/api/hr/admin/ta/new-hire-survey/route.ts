import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { buildNewHireSurveyInsights, getNewHireSurveyCcEmails, saveNewHireSurveyCcEmails, NEW_HIRE_QUESTIONS } from '@/lib/new-hire-survey'

export async function GET() {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const [surveys, ccEmails] = await Promise.all([
    prisma.newHireExperienceSurvey.findMany({ orderBy: { hireDate: 'desc' } }),
    getNewHireSurveyCcEmails(),
  ])
  // Question definitions ship alongside the rows (rather than the client importing new-hire-
  // survey.ts directly) so the admin panel can render a named individual-response view — that
  // file also pulls in prisma/mailer, which have no business in a client bundle.
  return NextResponse.json({ surveys, insights: buildNewHireSurveyInsights(surveys), ccEmails, questions: NEW_HIRE_QUESTIONS })
}

// Saves TA's own Cc list for this survey (comma/semicolon-separated, any number of addresses) —
// deliberately separate from the platform-wide Default Cc.
export async function PUT(req: NextRequest) {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => null)
  if (typeof body?.ccEmails !== 'string') return NextResponse.json({ error: 'Missing ccEmails.' }, { status: 400 })
  await saveNewHireSurveyCcEmails(body.ccEmails)
  return NextResponse.json({ ok: true })
}
