import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Every training cohort (same training+month+year grouping as the main records list) where NOT A
// SINGLE attendee has one or more of Vendor/Cost/Hours/Training Type/Capability on file — all five
// are normally set once per schedule and apply to everyone in it, so "missing for the whole
// cohort" is the actual gap to fix, not one stray record diverging from the rest of its group.
// Cost is treated as missing when it's exactly 0 — the field itself has no way to distinguish "a
// genuinely free training" from "never set" (both store 0), and in practice an unset cost is far
// more common than a real ₦0 training.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const all = await prisma.trainingRecord.findMany({
      select: {
        id: true, staffName: true, staffId: true, businessUnit: true, training: true, month: true, year: true,
        vendor: true, cost: true, hours: true, trainingType: true, capability: true,
      },
      orderBy: [{ year: 'desc' }, { staffName: 'asc' }],
    })

    const groups = new Map<string, typeof all>()
    for (const r of all) {
      const key = `${r.training.trim().toLowerCase()}|${r.month}|${r.year}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    const FIELD_CHECKS: { key: 'vendor' | 'cost' | 'hours' | 'trainingType' | 'capability'; label: string; isMissing: (r: (typeof all)[number]) => boolean }[] = [
      { key: 'vendor', label: 'Vendor', isMissing: (r) => !r.vendor?.trim() },
      { key: 'cost', label: 'Cost', isMissing: (r) => !r.cost },
      { key: 'hours', label: 'Hours', isMissing: (r) => r.hours == null },
      { key: 'trainingType', label: 'Type', isMissing: (r) => !r.trainingType?.trim() },
      { key: 'capability', label: 'Capability', isMissing: (r) => !r.capability?.trim() },
    ]

    const missing = [...groups.values()]
      .map((records) => {
        const missingFields = FIELD_CHECKS.filter((f) => records.every((r) => f.isMissing(r))).map((f) => f.key)
        return { records, missingFields }
      })
      .filter((g) => g.missingFields.length > 0)
      .map(({ records, missingFields }) => ({
        training: records[0].training,
        month: records[0].month,
        year: records[0].year,
        businessUnits: [...new Set(records.map((r) => r.businessUnit))].sort(),
        attendeeCount: records.length,
        missingFields,
        records: records.map((r) => ({ id: r.id, staffName: r.staffName, staffId: r.staffId, businessUnit: r.businessUnit })),
      }))
      .sort((a, b) => (b.year - a.year) || a.training.localeCompare(b.training))

    return NextResponse.json(missing)
  } catch (err) {
    console.error('[admin/records/training/missing-vendor GET]', err)
    return NextResponse.json({ error: 'Failed to load trainings missing details.' }, { status: 500 })
  }
}
