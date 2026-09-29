import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { MONTHS, resolveFilter, activeMonthIndices, type PeriodFilter } from '@/lib/filter-types'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'

// Flat, unpaginated, every-field pull of Training records for the "Download Report" panel — the
// regular GET /api/admin/records/training endpoint is grouped-by-training-cohort and paginated
// for the on-screen table, neither of which is what a full period export needs.
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

    const all = await prisma.trainingRecord.findMany()

    let rows = all
    if (resolved.mode !== 'all') {
      rows = rows.filter((r) => r.year === resolved.year)
      const months = activeMonthIndices(resolved)
      if (months) {
        const monthSet = new Set(months.map((i) => MONTHS[i]))
        rows = rows.filter((r) => monthSet.has(r.month as (typeof MONTHS)[number]))
      }
    }

    // Most recent year first, then calendar order (January -> December) within each year —
    // matches how these reports actually get read, not upload/creation order.
    rows.sort((a, b) => (b.year - a.year) || (MONTHS.indexOf(a.month as (typeof MONTHS)[number]) - MONTHS.indexOf(b.month as (typeof MONTHS)[number])))

    // A record's `email` column is often blank — it was never part of every upload's columns —
    // so resolve it fresh from the current roster by Staff ID wherever that's the case, rather
    // than leaving the export column empty when the address is readily available.
    const directory = await loadRosterDirectory()

    return NextResponse.json(
      rows.map((r) => ({
        serialNo: r.serialNo || '',
        staffName: r.staffName,
        staffId: r.staffId,
        email: r.email || resolveStaff(r.staffId, directory)?.email || '',
        businessUnit: r.businessUnit,
        training: r.training,
        month: r.month,
        year: r.year,
        cost: r.cost,
        hours: r.hours ?? '',
        trainingType: r.trainingType || '',
        capability: r.capability || '',
        vendor: r.vendor || '',
        dateAdded: r.createdAt.toISOString().slice(0, 10),
      }))
    )
  } catch (err) {
    console.error('[admin/records/training/export GET]', err)
    return NextResponse.json({ error: 'Failed to export training records.' }, { status: 500 })
  }
}
