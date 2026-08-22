import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { applyAllTrainingRecordChanges } from '@/lib/sheets-sync'

// Batched + progress-as-it-goes (see applyAllTrainingRecordChanges) so a large pending list
// doesn't need to finish inside one request to make real, visible progress. Also raises this
// route's own execution budget, since even batched this can still legitimately take a while
// over a few hundred rows — re-running "Accept All" simply picks up wherever the last run left off.
export const maxDuration = 60

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await applyAllTrainingRecordChanges()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/training-record-changes/accept-all]', err)
    return NextResponse.json({ error: 'Failed to apply all changes — some may have already gone through; refresh to see current progress.' }, { status: 500 })
  }
}
