import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { applyTrainingRecordChange } from '@/lib/sheets-sync'

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const changes = await prisma.trainingRecordChange.findMany()
    for (const change of changes) {
      await applyTrainingRecordChange(change)
    }
    await prisma.trainingRecordChange.deleteMany({ where: { id: { in: changes.map((c) => c.id) } } })

    return NextResponse.json({ applied: changes.length })
  } catch (err) {
    console.error('[admin/training-record-changes/accept-all]', err)
    return NextResponse.json({ error: 'Failed to apply all changes.' }, { status: 500 })
  }
}
