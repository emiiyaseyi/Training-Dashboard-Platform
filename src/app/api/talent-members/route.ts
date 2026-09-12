import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session-guard'
import { hasAccess } from '@/lib/permissions'
import { computeTalentMemberReport } from '@/lib/talent-member'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'

export async function GET(req: NextRequest) {
  // Consumed by both the Learning Intelligence Talent Members page and the HR Talent Management
  // unit (see src/app/hr/talent-management/page.tsx) — either permission is enough to read it,
  // since it's the same underlying roster/coverage figures either audience needs.
  const session = await requireSession()
  if (session instanceof NextResponse) return session
  if (
    !session.user.isSuperAdmin &&
    !hasAccess(session.user.permissions?.['talent-members'], 'view') &&
    !hasAccess(session.user.permissions?.['hr-talent-management'], 'view')
  ) {
    return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 })
  }

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
