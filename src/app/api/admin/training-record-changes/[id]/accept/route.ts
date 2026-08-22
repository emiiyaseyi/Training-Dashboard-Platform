import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { applyTrainingRecordChange } from '@/lib/sheets-sync'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const change = await prisma.trainingRecordChange.findUnique({ where: { id } })
    if (!change) return NextResponse.json({ error: 'Change not found — it may have already been resolved.' }, { status: 404 })

    await applyTrainingRecordChange(change)
    await prisma.trainingRecordChange.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/training-record-changes/[id]/accept]', err)
    return NextResponse.json({ error: 'Failed to apply this change.' }, { status: 500 })
  }
}
