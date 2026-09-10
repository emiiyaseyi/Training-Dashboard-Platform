import { NextRequest, NextResponse } from 'next/server'
import { computeCustomRecordsReport } from '@/lib/custom-records-report'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'
import { requirePermission, buScopeFilter } from '@/lib/session-guard'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('report-generation', 'view')
  if (gate instanceof NextResponse) return gate

  const sp = req.nextUrl.searchParams
  const recordType = sp.get('recordType') === 'subscription' ? 'subscription' : 'training'

  const mode = (sp.get('filterMode') ?? 'all') as PeriodFilter['mode']
  const year = sp.get('year') ? parseInt(sp.get('year')!) : undefined
  const fromMonth = (sp.get('fromMonth') as PeriodFilter['fromMonth']) ?? undefined
  const toMonth = (sp.get('toMonth') as PeriodFilter['toMonth']) ?? undefined
  const validModes: PeriodFilter['mode'][] = ['all', 'year', 'ytd', 'range']
  const period: PeriodFilter = {
    mode: validModes.includes(mode) ? mode : 'all',
    year,
    fromMonth: fromMonth && MONTHS.includes(fromMonth as (typeof MONTHS)[number]) ? fromMonth : undefined,
    toMonth: toMonth && MONTHS.includes(toMonth as (typeof MONTHS)[number]) ? toMonth : undefined,
  }

  try {
    const report = await computeCustomRecordsReport(
      {
        recordType,
        staffName: sp.get('staffName') || undefined,
        businessUnit: sp.get('businessUnit') || undefined,
        department: sp.get('department') || undefined,
      },
      period,
      buScopeFilter(gate)
    )
    return NextResponse.json(report)
  } catch (err) {
    console.error('[reports/custom-records]', err)
    return NextResponse.json({ error: 'Failed to fetch records.' }, { status: 500 })
  }
}
