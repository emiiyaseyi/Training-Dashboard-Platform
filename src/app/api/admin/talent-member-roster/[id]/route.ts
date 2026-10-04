import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { mirrorRosterEntryToSheet } from '@/lib/talent-member-roster-mirror'

// Flips a roster entry's Active/Exited status. Someone who's left stays on the roster (their
// historical TM training attendance still needs to resolve, see talent-member.ts) but no longer
// counts toward the current pool size or "yet to attend" — this is the only place that status
// ever changes, so it's mirrored to the sheet the same way every other roster edit is.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const { status } = (await req.json()) as { status?: string }
    if (status !== 'Active' && status !== 'Exited') {
      return NextResponse.json({ error: 'status must be "Active" or "Exited".' }, { status: 400 })
    }

    const entry = await prisma.talentMemberInfo.update({ where: { id }, data: { status } })

    const result = await mirrorRosterEntryToSheet(entry)
    if (result.attempted) {
      await prisma.talentMemberInfo.update({
        where: { id },
        data: { sheetSyncedAt: result.success ? new Date() : null, sheetSyncError: result.success ? null : result.message },
      })
    }

    return NextResponse.json({ ...entry, sheetPush: result })
  } catch (err) {
    console.error('[admin/talent-member-roster/[id] PATCH]', err)
    return NextResponse.json({ error: 'Failed to update status.' }, { status: 500 })
  }
}
