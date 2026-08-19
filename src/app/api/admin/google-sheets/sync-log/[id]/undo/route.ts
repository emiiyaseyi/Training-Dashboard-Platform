import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Deletes exactly the UploadBatch rows this sync run created — cascades to their records
// (TrainingRecord/FeedbackRecord/SubscriptionRecord/KSSRecord all have onDelete: Cascade on
// batchId), the same mechanism the Upload History "Delete batch" button already uses. Nothing
// from any other sync or manual upload is touched.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const log = await prisma.googleSheetsSyncLog.findUnique({ where: { id } })
    if (!log) return NextResponse.json({ error: 'Sync log entry not found.' }, { status: 404 })
    if (log.undone) return NextResponse.json({ error: 'This sync was already undone.' }, { status: 400 })

    const batchIds: string[] = JSON.parse(log.batchIds)
    if (batchIds.length > 0) {
      await prisma.uploadBatch.deleteMany({ where: { id: { in: batchIds } } })
    }

    await prisma.googleSheetsSyncLog.update({
      where: { id },
      data: { undone: true, undoneAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/google-sheets/sync-log/undo]', err)
    return NextResponse.json({ error: 'Failed to undo this sync.' }, { status: 500 })
  }
}
