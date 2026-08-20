import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Persists a full reordering for one stage's question list — the client sends the complete
// ordered id list after a drag/move, and each id's `order` becomes its index in that list.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { orderedIds } = (await req.json()) as { orderedIds: string[] }
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds is required.' }, { status: 400 })
    }
    await prisma.$transaction(
      orderedIds.map((id, index) => prisma.surveyQuestion.update({ where: { id }, data: { order: index } }))
    )
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/survey-questions/reorder POST]', err)
    return NextResponse.json({ error: 'Failed to reorder questions.' }, { status: 500 })
  }
}
