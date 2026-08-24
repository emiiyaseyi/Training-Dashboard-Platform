import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { backfillDataQualityFromRoster } from '@/lib/data-quality-audit'

export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await backfillDataQualityFromRoster()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/data-quality/backfill-from-roster POST]', err)
    return NextResponse.json({ error: 'Backfill failed unexpectedly.' }, { status: 500 })
  }
}
