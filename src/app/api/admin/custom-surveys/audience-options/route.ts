import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Distinct Department/Role values seen on the active roster — these aren't an admin-managed
// taxonomy like Business Unit/Training Type, just whatever free text was uploaded, so the picker
// offers exactly what's actually on file rather than a fixed list.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const all = await prisma.staffRosterRecord.findMany({
    where: { active: true },
    select: { staffId: true, department: true, role: true, businessUnit: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const latestByStaffId = new Map<string, (typeof all)[number]>()
  for (const r of all) latestByStaffId.set(r.staffId, r)
  const roster = [...latestByStaffId.values()]

  const departments = [...new Set(roster.map((r) => (r.department || '').trim()).filter(Boolean))].sort()
  const roles = [...new Set(roster.map((r) => (r.role || '').trim()).filter(Boolean))].sort()
  const businessUnits = [...new Set(roster.map((r) => r.businessUnit).filter(Boolean))].sort()

  return NextResponse.json({ departments, roles, businessUnits })
}
