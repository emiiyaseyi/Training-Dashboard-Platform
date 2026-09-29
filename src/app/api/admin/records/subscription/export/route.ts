import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { MONTHS, type PeriodFilter } from '@/lib/filter-types'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'

const CATEGORY_LABELS: Record<string, string> = { membership: 'Membership Subscription', certification: 'Certification Refund' }

// Flat, unpaginated, every-field pull of Subscription records for the "Download Report" panel.
// SubscriptionRecord has no year field at all (see schema.prisma) — month-only filtering, same
// convention already used by the Custom Records Lookup report (custom-records-report.ts): a
// "Full Year"/"All Time" selection and a specific year on 'ytd'/'range' modes can't be
// distinguished here, since the data itself doesn't carry a year to check against.
export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const sp = req.nextUrl.searchParams
    const mode = (sp.get('filterMode') as PeriodFilter['mode']) || 'all'
    const fromMonth = sp.get('fromMonth') || undefined
    const toMonth = sp.get('toMonth') || undefined

    let monthSet: Set<string> | null = null
    if (mode === 'ytd') {
      monthSet = new Set(MONTHS.slice(0, new Date().getMonth() + 1))
    } else if (mode === 'range' && fromMonth && toMonth) {
      const from = MONTHS.indexOf(fromMonth as (typeof MONTHS)[number])
      const to = MONTHS.indexOf(toMonth as (typeof MONTHS)[number])
      if (from !== -1 && to !== -1) {
        monthSet = new Set(MONTHS.slice(Math.min(from, to), Math.max(from, to) + 1))
      }
    }

    const all = await prisma.subscriptionRecord.findMany()
    let rows = monthSet ? all.filter((r) => r.month && monthSet!.has(r.month)) : all
    rows = rows.slice().sort((a, b) => MONTHS.indexOf((a.month || '') as (typeof MONTHS)[number]) - MONTHS.indexOf((b.month || '') as (typeof MONTHS)[number]))

    const directory = await loadRosterDirectory()

    return NextResponse.json(
      rows.map((r) => ({
        staffName: r.staffName,
        staffId: r.staffId,
        email: r.email || resolveStaff(r.staffId, directory)?.email || '',
        businessUnit: r.businessUnit,
        category: CATEGORY_LABELS[r.category] || r.category,
        membershipOrg: r.membershipOrg,
        amount: r.amount,
        month: r.month || '',
        dateAdded: r.createdAt.toISOString().slice(0, 10),
      }))
    )
  } catch (err) {
    console.error('[admin/records/subscription/export GET]', err)
    return NextResponse.json({ error: 'Failed to export subscription records.' }, { status: 500 })
  }
}
