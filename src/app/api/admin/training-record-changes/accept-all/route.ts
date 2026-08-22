import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const changes = await prisma.trainingRecordChange.findMany()
    for (const change of changes) {
      const newData = JSON.parse(change.newData) as {
        staffId: string; staffName: string; businessUnit: string
        cost: number; hours: number | null; trainingType: string | null; capability: string | null; month: string
      }
      await prisma.trainingRecord.update({ where: { id: change.existingRecordId }, data: newData })
    }
    await prisma.trainingRecordChange.deleteMany({ where: { id: { in: changes.map((c) => c.id) } } })

    return NextResponse.json({ applied: changes.length })
  } catch (err) {
    console.error('[admin/training-record-changes/accept-all]', err)
    return NextResponse.json({ error: 'Failed to apply all changes.' }, { status: 500 })
  }
}
