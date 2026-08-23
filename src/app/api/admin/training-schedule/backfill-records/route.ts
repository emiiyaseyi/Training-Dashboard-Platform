import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { backfillTrainingRecordsFromSchedules } from '@/lib/training-record-backfill'

// One-time catch-up action for schedule attendees added before attendee-add started writing a
// TrainingRecord directly — see src/lib/training-record-backfill.ts.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await backfillTrainingRecordsFromSchedules()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/training-schedule/backfill-records]', err)
    return NextResponse.json({ error: 'Backfill failed unexpectedly.' }, { status: 500 })
  }
}
