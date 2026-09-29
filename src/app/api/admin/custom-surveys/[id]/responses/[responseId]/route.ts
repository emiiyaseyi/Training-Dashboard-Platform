import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Admin correction of an already-submitted Custom Survey response. Custom Survey answers don't
// feed any separate structured record the way Post-1/Post-2 answers do (see
// survey-structured-sync.ts) — the response row IS the data a Custom Survey's Insights view reads
// — so there's nothing else to keep in sync here.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id, responseId } = await params
  const { answers } = (await req.json()) as { answers?: Record<string, string | string[]> }
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'answers is required.' }, { status: 400 })
  }

  const response = await prisma.customSurveyResponse.findUnique({
    where: { id: responseId },
    include: { recipient: true },
  })
  if (!response || response.recipient.surveyId !== id) {
    return NextResponse.json({ error: 'Response not found.' }, { status: 404 })
  }

  await prisma.customSurveyResponse.update({ where: { id: responseId }, data: { answers: JSON.stringify(answers) } })

  return NextResponse.json({ success: true })
}
