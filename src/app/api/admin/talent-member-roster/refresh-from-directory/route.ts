import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaffLooseAny } from '@/lib/staff-directory'
import { connectToSpreadsheet, batchUpdateRowsByKey } from '@/lib/google-sheets'

const NAME_CANDIDATES = ['name', 'fullname', 'staffname', 'employeename']
const STAFFID_CANDIDATES = ['staffid', 'staffno', 'employeeid', 'employeeno']
const EMAIL_CANDIDATES = ['email', 'emailaddress', 'staffemail', 'workemail']

// Re-resolves every roster entry against the current staff directory and backfills any
// missing/stale Staff ID, Name, or Email, then fixes the same fields on the sheet — in one pass
// over the whole roster (one directory load, one DB transaction, one sheet read, one batch
// write), rather than repeating each step per entry, which is what made this take forever.
export async function POST() {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const [entries, directory] = await Promise.all([
      prisma.talentMemberInfo.findMany(),
      loadRosterDirectory(),
    ])

    const toUpdate: { id: string; staffId: string; name: string; email: string | null; status?: string; wasSynced: boolean }[] = []
    for (const entry of entries) {
      const match = resolveStaffLooseAny(entry, directory)
      if (!match) continue
      // One-directional on purpose: if the roster shows them inactive but this entry still says
      // Active, correct it — that's the stale case this button exists to fix (e.g. Adaeze,
      // confirmed exited elsewhere but still showing Active here because nothing had ever synced
      // it). Never flips Exited back to Active automatically, since an admin may have marked
      // someone Exited from the TM programme specifically, independent of their roster status.
      const statusFix = !match.active && entry.status !== 'Exited' ? 'Exited' : undefined
      const changed = entry.staffId !== match.staffId || entry.name !== match.name || entry.email !== (match.email || null) || !!statusFix
      if (!changed) continue
      toUpdate.push({ id: entry.id, staffId: match.staffId, name: match.name, email: match.email || null, status: statusFix, wasSynced: !!entry.sheetSyncedAt })
    }

    if (toUpdate.length === 0) {
      return NextResponse.json({ updated: 0, total: entries.length })
    }

    await prisma.$transaction(
      toUpdate.map((u) => prisma.talentMemberInfo.update({
        where: { id: u.id },
        data: { staffId: u.staffId, name: u.name, email: u.email, ...(u.status ? { status: u.status } : {}) },
      }))
    )

    // Only entries that already had a row in the sheet need their existing row fixed — brand new
    // entries were mirrored (created) with the resolved details already, at add time.
    const alreadyInSheet = toUpdate.filter((u) => u.wasSynced)
    if (alreadyInSheet.length > 0) {
      const config = await prisma.googleSheetsConfig.findFirst()
      if (config?.spreadsheetUrl && config.talentMemberSheetName) {
        try {
          const connection = await connectToSpreadsheet(config.spreadsheetUrl)
          await batchUpdateRowsByKey(
            connection.spreadsheetId, config.talentMemberSheetName, connection.accessToken,
            STAFFID_CANDIDATES,
            alreadyInSheet.map((u) => ({
              keyValue: u.staffId,
              updates: [
                { columnCandidates: NAME_CANDIDATES, value: u.name },
                { columnCandidates: EMAIL_CANDIDATES, value: u.email || '' },
              ],
            }))
          )
        } catch (err) {
          console.error('[talent-member-roster/refresh-from-directory] sheet batch update failed', err)
          // DB is already updated and is the source of truth for the report — a sheet write
          // failure here doesn't need to fail the whole request, the per-row Retry still covers it.
        }
      }
    }

    return NextResponse.json({ updated: toUpdate.length, total: entries.length })
  } catch (err) {
    console.error('[admin/talent-member-roster/refresh-from-directory]', err)
    return NextResponse.json({ error: 'Failed to refresh roster from the staff directory.' }, { status: 500 })
  }
}
