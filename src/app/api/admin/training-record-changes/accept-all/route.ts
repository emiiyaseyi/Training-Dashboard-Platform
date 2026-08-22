import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { applyNextTrainingRecordChangeChunk } from '@/lib/sheets-sync'

// Applies exactly one small chunk (10 records) per call — see applyNextTrainingRecordChangeChunk
// for why. The admin panel calls this repeatedly in a loop until `remaining` hits 0; each call on
// its own is fast enough to never risk hitting this route's time limit, and whatever it applies is
// permanently saved (proposals deleted) before it returns, so the loop being interrupted at any
// point never loses previously-completed work.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await applyNextTrainingRecordChangeChunk()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/training-record-changes/accept-all]', err)
    return NextResponse.json({ error: 'Failed to apply this chunk — anything applied before this point is saved; try again.' }, { status: 500 })
  }
}
