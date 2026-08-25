import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { backfillDataQualityFromRoster } from '@/lib/data-quality-audit'

// A first-time backfill (e.g. filling the newly added Staff Email column) can touch thousands of
// rows across four tables — headroom beyond Vercel's default so it can actually finish.
export const maxDuration = 60

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
