import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Every training cohort (same training+month+year grouping as the main records list) where NOT
// A SINGLE attendee has a vendor on file — vendor is normally set once per schedule and applies
// to everyone in it, so "missing for the whole cohort" is the actual gap to fix, not one stray
// record diverging from the rest of its group.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const all = await prisma.trainingRecord.findMany({
      select: { id: true, staffName: true, staffId: true, businessUnit: true, training: true, month: true, year: true, vendor: true },
      orderBy: [{ year: 'desc' }, { staffName: 'asc' }],
    })

    const groups = new Map<string, typeof all>()
    for (const r of all) {
      const key = `${r.training.trim().toLowerCase()}|${r.month}|${r.year}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    const missing = [...groups.values()]
      .filter((records) => records.every((r) => !r.vendor?.trim()))
      .map((records) => ({
        training: records[0].training,
        month: records[0].month,
        year: records[0].year,
        businessUnits: [...new Set(records.map((r) => r.businessUnit))].sort(),
        attendeeCount: records.length,
        records: records.map((r) => ({ id: r.id, staffName: r.staffName, staffId: r.staffId, businessUnit: r.businessUnit })),
      }))
      .sort((a, b) => (b.year - a.year) || a.training.localeCompare(b.training))

    return NextResponse.json(missing)
  } catch (err) {
    console.error('[admin/records/training/missing-vendor GET]', err)
    return NextResponse.json({ error: 'Failed to load trainings missing a vendor.' }, { status: 500 })
  }
}
