import { NextRequest, NextResponse } from 'next/server'
import { computeBUAnalytics } from '@/lib/analytics'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const bu = sp.get('name')
  if (!bu) {
    return NextResponse.json({ error: 'Missing ?name= parameter.' }, { status: 400 })
  }

  const mode = (sp.get('filterMode') ?? 'all') as PeriodFilter['mode']
  const year = sp.get('year') ? parseInt(sp.get('year')!) : undefined
  const fromMonth = sp.get('fromMonth') as PeriodFilter['fromMonth'] ?? undefined
  const toMonth   = sp.get('toMonth')   as PeriodFilter['toMonth']   ?? undefined

  const validModes: PeriodFilter['mode'][] = ['all', 'year', 'ytd', 'range']
  const filter: PeriodFilter = {
    mode:      validModes.includes(mode) ? mode : 'all',
    year,
    fromMonth: fromMonth && MONTHS.includes(fromMonth as typeof MONTHS[number]) ? fromMonth : undefined,
    toMonth:   toMonth   && MONTHS.includes(toMonth   as typeof MONTHS[number]) ? toMonth   : undefined,
  }

  try {
    const analytics = await computeBUAnalytics(bu, filter)
    return NextResponse.json(analytics)
  } catch (err) {
    console.error('[analytics/bu]', err)
    return NextResponse.json({ error: 'Failed to compute BU analytics.' }, { status: 500 })
  }
}
