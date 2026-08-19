import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const logs = await prisma.googleSheetsSyncLog.findMany({
    orderBy: { syncedAt: 'desc' },
    take: 5,
  })

  return NextResponse.json(
    logs.map((l) => ({
      id: l.id,
      syncedAt: l.syncedAt,
      trigger: l.trigger,
      success: l.success,
      imported: JSON.parse(l.imported),
      errors: JSON.parse(l.errors),
      undone: l.undone,
      undoneAt: l.undoneAt,
    }))
  )
}
