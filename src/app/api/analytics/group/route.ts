import { NextRequest, NextResponse } from 'next/server'
import { computeGroupAnalytics } from '@/lib/analytics'
import { generateExecutiveNarrative } from '@/lib/narrative'
import type { PeriodFilter } from '@/lib/filter-types'
import { MONTHS } from '@/lib/filter-types'
import { requireSession, buScopeFilter } from '@/lib/session-guard'

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    if (session instanceof NextResponse) return session

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

    // Executive Overview always shows full group-wide data to everyone, regardless of BU
    // scope — every other page consuming this endpoint (Training Analytics, Subscriptions,
    // Business Units, Capability Coverage) is restricted to the caller's assigned BU(s).
    const full = sp.get('full') === 'true'
    const scope = full ? null : buScopeFilter(session)

    const subCategoryParam = sp.get('subscriptionCategory')
    const subscriptionCategory = subCategoryParam === 'membership' || subCategoryParam === 'certification' ? subCategoryParam : null

    const analytics = await computeGroupAnalytics(filter, scope, subscriptionCategory)
    const narrative = generateExecutiveNarrative(analytics)
    return NextResponse.json({ ...analytics, narrative })
  } catch (err) {
    console.error('[analytics/group]', err)
    return NextResponse.json({ error: 'Failed to compute analytics.' }, { status: 500 })
  }
}
