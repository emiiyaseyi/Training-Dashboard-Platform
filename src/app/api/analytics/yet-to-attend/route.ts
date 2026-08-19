import { NextRequest, NextResponse } from 'next/server'
import { computeYetToAttend } from '@/lib/roster-analytics'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'
import { requirePermission, buScopeFilter } from '@/lib/session-guard'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('yet-to-attend', 'view')
  if (gate instanceof NextResponse) return gate

  const sp = req.nextUrl.searchParams
  const mode = (sp.get('filterMode') ?? 'all') as PeriodFilter['mode']
  const year = sp.get('year') ? parseInt(sp.get('year')!) : undefined
  const fromMonth = (sp.get('fromMonth') as PeriodFilter['fromMonth']) ?? undefined
  const toMonth = (sp.get('toMonth') as PeriodFilter['toMonth']) ?? undefined

  const validModes: PeriodFilter['mode'][] = ['all', 'year', 'ytd', 'range']
  const filter: PeriodFilter = {
    mode: validModes.includes(mode) ? mode : 'all',
    year,
    fromMonth: fromMonth && MONTHS.includes(fromMonth as (typeof MONTHS)[number]) ? fromMonth : undefined,
    toMonth: toMonth && MONTHS.includes(toMonth as (typeof MONTHS)[number]) ? toMonth : undefined,
  }

  try {
    const report = await computeYetToAttend(filter, buScopeFilter(gate))
    return NextResponse.json(report)
  } catch (err) {
    console.error('[analytics/yet-to-attend]', err)
    return NextResponse.json({ error: 'Failed to compute report.' }, { status: 500 })
  }
}
