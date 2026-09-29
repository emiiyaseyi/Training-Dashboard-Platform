import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeStaffIdKey } from '@/lib/staff-id'

// Same person, same training name, but filed under more than one Month/Year — almost always the
// same real attendance recorded twice (a re-sync, a manual re-add, a typo'd month later
// corrected by adding a new row instead of editing the old one) rather than two genuinely
// separate cohorts of the same course. Grouped by Staff ID (falls back to normalized name if a
// record has no Staff ID at all) + training name, loosely normalized the same way the rest of
// this app's training matching does.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const all = await prisma.trainingRecord.findMany({
      select: {
        id: true, staffId: true, staffName: true, businessUnit: true, training: true, month: true, year: true,
        cost: true, hours: true, trainingType: true, capability: true, vendor: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const groups = new Map<string, typeof all>()
    for (const r of all) {
      const personKey = normalizeStaffIdKey(r.staffId) || r.staffName.trim().toLowerCase()
      const key = `${personKey}|${r.training.trim().toLowerCase()}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    const duplicates = [...groups.values()]
      .filter((records) => new Set(records.map((r) => `${r.month}|${r.year}`)).size > 1)
      .map((records) => ({
        staffName: records[0].staffName,
        staffId: records[0].staffId,
        training: records[0].training,
        records: records
          .map((r) => ({
            id: r.id, businessUnit: r.businessUnit, month: r.month, year: r.year,
            cost: r.cost, hours: r.hours, trainingType: r.trainingType, capability: r.capability, vendor: r.vendor,
            createdAt: r.createdAt.toISOString(),
          }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }))
      .sort((a, b) => a.staffName.localeCompare(b.staffName))

    return NextResponse.json(duplicates)
  } catch (err) {
    console.error('[admin/records/training/possible-duplicates GET]', err)
    return NextResponse.json({ error: 'Failed to load possible duplicate trainings.' }, { status: 500 })
  }
}
