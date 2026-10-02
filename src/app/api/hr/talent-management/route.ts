import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { computeTMDashboard } from '@/lib/talent-management-dashboard'
import { parsePeriodFilterFromParams } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const filter = parsePeriodFilterFromParams(req.nextUrl.searchParams)

  try {
    const data = await computeTMDashboard(filter)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[hr/talent-management GET]', err)
    return NextResponse.json({ error: 'Failed to compute the Talent Management dashboard.' }, { status: 500 })
  }
}
