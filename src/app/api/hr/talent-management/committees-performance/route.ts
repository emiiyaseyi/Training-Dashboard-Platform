import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { computeTMCommitteesPerformance } from '@/lib/talent-management-trends'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    return NextResponse.json(await computeTMCommitteesPerformance())
  } catch (err) {
    console.error('[hr/talent-management/committees-performance GET]', err)
    return NextResponse.json({ error: 'Failed to compute committees & performance data.' }, { status: 500 })
  }
}
