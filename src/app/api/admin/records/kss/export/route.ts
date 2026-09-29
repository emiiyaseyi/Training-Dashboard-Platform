import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { MONTHS, resolveFilter, activeMonthIndices, type PeriodFilter } from '@/lib/filter-types'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'

// Flat, unpaginated, every-field pull of KSS records for the "Download Report" panel — same
// shape/purpose as the Training records export route.
export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const sp = req.nextUrl.searchParams
    const filter: PeriodFilter = {
      mode: (sp.get('filterMode') as PeriodFilter['mode']) || 'all',
      year: sp.get('year') ? Number(sp.get('year')) : undefined,
      fromMonth: (sp.get('fromMonth') as PeriodFilter['fromMonth']) || undefined,
      toMonth: (sp.get('toMonth') as PeriodFilter['toMonth']) || undefined,
    }
    const resolved = resolveFilter(filter)

    const all = await prisma.kSSRecord.findMany()

    let rows = all
    if (resolved.mode !== 'all') {
      rows = rows.filter((r) => r.year === resolved.year)
      const months = activeMonthIndices(resolved)
      if (months) {
        const monthSet = new Set(months.map((i) => MONTHS[i]))
        rows = rows.filter((r) => r.month && monthSet.has(r.month as (typeof MONTHS)[number]))
      }
    }

    rows.sort((a, b) => ((b.year ?? 0) - (a.year ?? 0)) || (MONTHS.indexOf((a.month || '') as (typeof MONTHS)[number]) - MONTHS.indexOf((b.month || '') as (typeof MONTHS)[number])))

    const directory = await loadRosterDirectory()

    return NextResponse.json(
      rows.map((r) => ({
        staffName: r.staffName,
        staffId: r.staffId,
        email: r.email || resolveStaff(r.staffId, directory)?.email || '',
        businessUnit: r.businessUnit,
        durationMinutes: r.durationMinutes,
        month: r.month || '',
        year: r.year ?? '',
        dateAdded: r.createdAt.toISOString().slice(0, 10),
      }))
    )
  } catch (err) {
    console.error('[admin/records/kss/export GET]', err)
    return NextResponse.json({ error: 'Failed to export KSS records.' }, { status: 500 })
  }
}
