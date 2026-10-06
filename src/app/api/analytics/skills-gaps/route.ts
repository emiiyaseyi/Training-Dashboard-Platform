import { NextRequest, NextResponse } from 'next/server'
import { requireSession, buScopeFilter } from '@/lib/session-guard'
import { computeSkillsGapReport } from '@/lib/skills-gap'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  const scope = buScopeFilter(session)

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

  try {
    const report = await computeSkillsGapReport(filter, scope)
    return NextResponse.json(report)
  } catch (err) {
    console.error('[analytics/skills-gaps GET]', err)
    return NextResponse.json({ error: 'Failed to compute skills gap report.' }, { status: 500 })
  }
}
