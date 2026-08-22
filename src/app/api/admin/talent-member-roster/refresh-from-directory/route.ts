import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { backfillRosterEntryFromDirectory, mirrorRosterEntryToSheet } from '@/lib/talent-member-roster-mirror'

// Re-resolves every roster entry against the current staff directory and backfills any
// missing/stale Staff ID, Name, or Email — for entries added before creation-time resolution
// existed (or before the person had a matching directory record yet). Re-mirrors anything it
// updates so the sheet's own Name/Email columns get fixed in place too.
export async function POST() {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const entries = await prisma.talentMemberRosterEntry.findMany()
    let updated = 0
    for (const entry of entries) {
      const result = await backfillRosterEntryFromDirectory(entry)
      if (!result.updated) continue
      updated++
      const mirrorResult = await mirrorRosterEntryToSheet(result.entry)
      if (mirrorResult.attempted) {
        await prisma.talentMemberRosterEntry.update({
          where: { id: entry.id },
          data: { sheetSyncedAt: mirrorResult.success ? new Date() : null, sheetSyncError: mirrorResult.success ? null : mirrorResult.message },
        })
      }
    }
    return NextResponse.json({ updated, total: entries.length })
  } catch (err) {
    console.error('[admin/talent-member-roster/refresh-from-directory]', err)
    return NextResponse.json({ error: 'Failed to refresh roster from the staff directory.' }, { status: 500 })
  }
}
