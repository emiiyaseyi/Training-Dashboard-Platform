import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Pending edits a sync detected between an already-imported TrainingRecord and what the source
// sheet now says for what looks like the same event — held for review rather than auto-applied.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const changes = await prisma.trainingRecordChange.findMany({ orderBy: { detectedAt: 'desc' } })
    return NextResponse.json(
      changes.map((c) => ({
        id: c.id,
        existingRecordId: c.existingRecordId,
        oldData: JSON.parse(c.oldData),
        newData: JSON.parse(c.newData),
        changedFields: JSON.parse(c.changedFields),
        detectedAt: c.detectedAt,
      }))
    )
  } catch (err) {
    console.error('[admin/training-record-changes GET]', err)
    return NextResponse.json({ error: 'Failed to fetch pending changes.' }, { status: 500 })
  }
}
