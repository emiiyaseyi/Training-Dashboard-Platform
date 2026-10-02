import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { computeTMDashboard } from '@/lib/talent-management-dashboard'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const sp = req.nextUrl.searchParams
  const mode = (sp.get('filterMode') ?? 'all') as PeriodFilter['mode']
  const validModes: PeriodFilter['mode'][] = ['all', 'year', 'ytd', 'range']
  const year = sp.get('year') ? parseInt(sp.get('year')!) : undefined
  const fromMonth = (sp.get('fromMonth') as PeriodFilter['fromMonth']) ?? undefined
  const toMonth = (sp.get('toMonth') as PeriodFilter['toMonth']) ?? undefined

  const filter: PeriodFilter = {
    mode: validModes.includes(mode) ? mode : 'all',
    year,
    fromMonth: fromMonth && MONTHS.includes(fromMonth as typeof MONTHS[number]) ? fromMonth : undefined,
    toMonth: toMonth && MONTHS.includes(toMonth as typeof MONTHS[number]) ? toMonth : undefined,
  }

  try {
    const data = await computeTMDashboard(filter)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[hr/talent-management GET]', err)
    return NextResponse.json({ error: 'Failed to compute the Talent Management dashboard.' }, { status: 500 })
  }
}
