import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  try {
    const { orderedIds } = (await req.json()) as { orderedIds: string[] }
    if (!Array.isArray(orderedIds)) return NextResponse.json({ error: 'orderedIds must be an array.' }, { status: 400 })

    await prisma.$transaction(
      orderedIds.map((qid, i) => prisma.customSurveyQuestion.updateMany({ where: { id: qid, surveyId: id }, data: { order: i } }))
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/custom-surveys/[id]/questions/reorder POST]', err)
    return NextResponse.json({ error: 'Failed to reorder questions.' }, { status: 500 })
  }
}
