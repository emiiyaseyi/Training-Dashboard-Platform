import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Deletes every StrategicCommitteeRecord that never resolved to a Staff ID. These are what show up
// as duplicates alongside a resolved row for the same person — the unresolved one is leftover noise
// once the person has a proper row, not a second membership.
export async function POST() {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await prisma.strategicCommitteeRecord.deleteMany({ where: { staffId: null } })
    return NextResponse.json({ deleted: result.count })
  } catch (err) {
    console.error('[hr/talent-management/committees/remove-unresolved POST]', err)
    return NextResponse.json({ error: 'Failed to remove unresolved committee records.' }, { status: 500 })
  }
}
