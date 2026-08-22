import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const change = await prisma.trainingRecordChange.findUnique({ where: { id } })
    if (!change) return NextResponse.json({ error: 'Change not found — it may have already been resolved.' }, { status: 404 })

    const newData = JSON.parse(change.newData) as {
      staffId: string; staffName: string; businessUnit: string
      cost: number; hours: number | null; trainingType: string | null; capability: string | null; month: string
    }

    await prisma.trainingRecord.update({
      where: { id: change.existingRecordId },
      data: newData,
    })
    await prisma.trainingRecordChange.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-record-changes/[id]/accept]', err)
    return NextResponse.json({ error: 'Failed to apply this change.' }, { status: 500 })
  }
}
