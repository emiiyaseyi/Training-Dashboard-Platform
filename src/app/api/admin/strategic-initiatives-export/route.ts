import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Every TrainingRecord tagged with a Training Type currently classified "other" (Strategic
// Learning Initiative / Other Investment Budget) — full row detail, across every year and upload,
// not just the aggregate total shown on the KPI card. Classification is read live from
// TrainingType, so this always matches whatever's actually configured in Admin -> Training Types.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const [records, types] = await Promise.all([
      prisma.trainingRecord.findMany({ orderBy: [{ year: 'desc' }, { staffName: 'asc' }] }),
      prisma.trainingType.findMany({ select: { name: true, classification: true } }),
    ])

    const otherTypeNames = new Set(
      types.filter((t) => t.classification === 'other').map((t) => t.name.toLowerCase())
    )

    const rows = records
      .filter((r) => r.trainingType && otherTypeNames.has(r.trainingType.toLowerCase()))
      .map((r) => ({
        'Staff ID': r.staffId,
        Name: r.staffName,
        'Business Unit': r.businessUnit,
        Training: r.training,
        'Training Type': r.trainingType,
        Month: r.month,
        Year: r.year,
        'Cost (₦)': r.cost,
        'Learning Hours': r.hours ?? '',
        'Differentiating Capability': r.capability ?? '',
        Vendor: r.vendor ?? '',
      }))

    return NextResponse.json({ rows, otherTypeNames: [...otherTypeNames] })
  } catch (err) {
    console.error('[admin/strategic-initiatives-export]', err)
    return NextResponse.json({ error: 'Failed to build the export.' }, { status: 500 })
  }
}
