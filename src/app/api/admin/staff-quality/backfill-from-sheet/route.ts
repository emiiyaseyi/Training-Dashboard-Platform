import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { backfillRosterFromSheet } from '@/lib/sheets-sync'

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await backfillRosterFromSheet()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/staff-quality/backfill-from-sheet POST]', err)
    return NextResponse.json({ error: 'Backfill failed unexpectedly.' }, { status: 500 })
  }
}
