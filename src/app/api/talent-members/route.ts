import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { computeTalentMemberReport } from '@/lib/talent-member'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('talent-members', 'view')
  if (gate instanceof NextResponse) return gate

  const sp = req.nextUrl.searchParams
  const mode = (sp.get('filterMode') ?? 'year') as PeriodFilter['mode']
  const validModes: PeriodFilter['mode'][] = ['all', 'year', 'ytd', 'range']
  const year = sp.get('year') ? parseInt(sp.get('year')!) : undefined
  const fromMonth = sp.get('fromMonth') as PeriodFilter['fromMonth'] ?? undefined
  const toMonth = sp.get('toMonth') as PeriodFilter['toMonth'] ?? undefined

  const filter: PeriodFilter = {
    mode: validModes.includes(mode) ? mode : 'year',
    year,
    fromMonth: fromMonth && MONTHS.includes(fromMonth as typeof MONTHS[number]) ? fromMonth : undefined,
    toMonth: toMonth && MONTHS.includes(toMonth as typeof MONTHS[number]) ? toMonth : undefined,
  }

  try {
    const report = await computeTalentMemberReport(filter)
    return NextResponse.json(report)
  } catch (err) {
    console.error('[talent-members GET]', err)
    return NextResponse.json({ error: 'Failed to compute Talent Members report.' }, { status: 500 })
  }
}
