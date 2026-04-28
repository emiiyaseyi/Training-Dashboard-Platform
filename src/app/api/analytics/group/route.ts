import { NextRequest, NextResponse } from 'next/server'
import { computeGroupAnalytics } from '@/lib/analytics'
import { generateExecutiveNarrative } from '@/lib/narrative'
import type { PeriodFilter } from '@/lib/filter-types'
import { MONTHS } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const mode = (sp.get('filterMode') ?? 'all') as PeriodFilter['mode']
    const year = sp.get('year') ? parseInt(sp.get('year')!) : undefined
    const fromMonth = sp.get('fromMonth') as PeriodFilter['fromMonth'] ?? undefined
    const toMonth = sp.get('toMonth') as PeriodFilter['toMonth'] ?? undefined

    const validModes: PeriodFilter['mode'][] = ['all', 'year', 'ytd', 'range']
    const filter: PeriodFilter = {
      mode: validModes.includes(mode) ? mode : 'all',
      year,
      fromMonth: fromMonth && MONTHS.includes(fromMonth as typeof MONTHS[number]) ? fromMonth : undefined,
      toMonth: toMonth && MONTHS.includes(toMonth as typeof MONTHS[number]) ? toMonth : undefined,
    }

    const analytics = await computeGroupAnalytics(filter)
    const narrative = generateExecutiveNarrative(analytics)
    return NextResponse.json({ ...analytics, narrative })
  } catch (err) {
    console.error('[analytics/group]', err)
    return NextResponse.json({ error: 'Failed to compute analytics.' }, { status: 500 })
  }
}
