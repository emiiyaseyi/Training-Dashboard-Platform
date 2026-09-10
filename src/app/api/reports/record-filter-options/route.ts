import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Distinct Department/Business Unit values seen on the active roster, for the Custom Records
// filter panel — same source/convention as the Custom Survey audience picker's equivalent route.
export async function GET() {
  const gate = await requirePermission('report-generation', 'view')
  if (gate instanceof NextResponse) return gate

  const all = await prisma.staffRosterRecord.findMany({
    where: { active: true },
    select: { staffId: true, department: true, businessUnit: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const latestByStaffId = new Map<string, (typeof all)[number]>()
  for (const r of all) latestByStaffId.set(r.staffId, r)
  const roster = [...latestByStaffId.values()]

  const departments = [...new Set(roster.map((r) => (r.department || '').trim()).filter(Boolean))].sort()
  const businessUnits = [...new Set(roster.map((r) => r.businessUnit).filter(Boolean))].sort()

  return NextResponse.json({ departments, businessUnits })
}
