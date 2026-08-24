import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { launchCustomSurvey } from '@/lib/custom-survey'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.customSurvey.findUnique({ where: { id }, include: { questions: true } })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
  if (survey.status !== 'draft') {
    return NextResponse.json({ error: 'This survey has already been launched.' }, { status: 400 })
  }
  if (survey.questions.length === 0) {
    return NextResponse.json({ error: 'Add at least one question before launching.' }, { status: 400 })
  }

  try {
    const result = await launchCustomSurvey(survey)
    if (result.recipientCount === 0) {
      // Roll back to draft — nothing was actually sent, and an empty "launched" survey with no
      // recipients would just be confusing to see in the list.
      await prisma.customSurvey.update({ where: { id }, data: { status: 'draft', launchedAt: null } })
      return NextResponse.json({ error: 'No staff matched the selected audience — nothing was sent.' }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/custom-surveys/[id]/launch POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to launch survey.' }, { status: 500 })
  }
}
