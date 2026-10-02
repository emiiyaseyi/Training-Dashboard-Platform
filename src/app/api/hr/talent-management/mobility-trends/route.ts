import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { computeTMMobilityTrends } from '@/lib/talent-management-trends'
import { parsePeriodFilterFromParams } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const filter = parsePeriodFilterFromParams(req.nextUrl.searchParams)

  try {
    return NextResponse.json(await computeTMMobilityTrends(filter))
  } catch (err) {
    console.error('[hr/talent-management/mobility-trends GET]', err)
    return NextResponse.json({ error: 'Failed to compute mobility trends.' }, { status: 500 })
  }
}
