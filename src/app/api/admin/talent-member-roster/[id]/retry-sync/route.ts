import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { mirrorRosterEntryToSheet } from '@/lib/talent-member-roster-mirror'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const entry = await prisma.talentMemberRosterEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: 'Roster entry not found.' }, { status: 404 })

  const result = await mirrorRosterEntryToSheet(entry)
  if (result.attempted) {
    await prisma.talentMemberRosterEntry.update({
      where: { id },
      data: { sheetSyncedAt: result.success ? new Date() : null, sheetSyncError: result.success ? null : result.message },
    })
  }
  return NextResponse.json(result)
}
