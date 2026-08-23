import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const PAGE_SIZE = 20

// Grouped by training + month/year (same cohort logic as Already Attended Trainings) rather than
// a flat row list — "delete this whole training" and "edit this one participant" both need to
// operate at the right level, and a training with 30 attendees is more usable as one expandable
// group than 30 identical-looking rows in a flat table.
export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() || ''
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'))

    const [records, schedules] = await Promise.all([
      prisma.trainingRecord.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.trainingSchedule.findMany({ select: { trainingName: true } }),
    ])
    const existingScheduleNames = new Set(schedules.map((s) => s.trainingName.trim().toLowerCase()))

    const groups = new Map<string, {
      training: string; month: string; year: number
      records: typeof records
    }>()
    for (const r of records) {
      const key = `${r.training.trim().toLowerCase()}|${r.month}|${r.year}`
      if (!groups.has(key)) groups.set(key, { training: r.training.trim(), month: r.month, year: r.year, records: [] })
      groups.get(key)!.records.push(r)
    }

    let result = [...groups.values()].map((g) => {
      const businessUnits = [...new Set(g.records.map((r) => r.businessUnit))].sort()
      return {
        training: g.training,
        month: g.month,
        year: g.year,
        businessUnits,
        attendeeCount: g.records.length,
        totalCost: g.records.reduce((s, r) => s + r.cost, 0),
        hasExistingSchedule: existingScheduleNames.has(g.training.toLowerCase()),
        records: g.records
          .map((r) => ({
            id: r.id, staffId: r.staffId, staffName: r.staffName, businessUnit: r.businessUnit,
            cost: r.cost, hours: r.hours, trainingType: r.trainingType, capability: r.capability, vendor: r.vendor,
          }))
          .sort((a, b) => a.staffName.localeCompare(b.staffName)),
      }
    })

    if (search) {
      result = result.filter((g) =>
        g.training.toLowerCase().includes(search) ||
        g.businessUnits.some((bu) => bu.toLowerCase().includes(search)) ||
        g.records.some((r) => r.staffName.toLowerCase().includes(search) || r.staffId.toLowerCase().includes(search))
      )
    }
    result.sort((a, b) => (b.year - a.year) || a.training.localeCompare(b.training))

    const total = result.length
    const paged = result.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    return NextResponse.json({ groups: paged, total, pageSize: PAGE_SIZE })
  } catch (err) {
    console.error('[admin/records/training GET]', err)
    return NextResponse.json({ error: 'Failed to fetch training records.' }, { status: 500 })
  }
}
