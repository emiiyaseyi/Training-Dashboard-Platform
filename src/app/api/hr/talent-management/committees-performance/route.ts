import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { computeTMCommitteesPerformance } from '@/lib/talent-management-trends'
import { parsePeriodFilterFromParams } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const filter = parsePeriodFilterFromParams(req.nextUrl.searchParams)

  try {
    return NextResponse.json(await computeTMCommitteesPerformance(filter))
  } catch (err) {
    console.error('[hr/talent-management/committees-performance GET]', err)
    return NextResponse.json({ error: 'Failed to compute committees & performance data.' }, { status: 500 })
  }
}
