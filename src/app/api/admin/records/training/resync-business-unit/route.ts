import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'
import { normalizeTrainingNameKey } from '@/lib/training-name'

export const maxDuration = 60

// Unlike backfill-from-roster (data-quality-audit.ts), which only ever fills a BLANK Business
// Unit, this OVERWRITES an already-present-but-wrong one with each attendee's CURRENT roster BU —
// for exactly the case an admin actually hits: every attendee of a training was recorded under
// the same (wrong) Business Unit, not a blank one. Scoped to one training name when provided (the
// normal case — an admin fixing the specific training they're looking at), or every Training
// record in the database when omitted, for "and any of such training" cleanup in one pass.
// staffId is the only safe key to resolve from — a record with an UNKNOWN_-prefixed or blank
// staffId is skipped and reported, not guessed at.
//
// Database only — the Google Sheet mirror's push helper (pushTrainingRecordFieldsToSheet) doesn't
// support a businessUnit field yet, so a corrected row here doesn't propagate back to the sheet
// the way a Vendor/Cost/Hours/Type/Capability/Month edit does.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { trainingName } = (await req.json().catch(() => ({}))) as { trainingName?: string }

  const directory = await loadRosterDirectory()
  // Filtered in JS (via normalizeTrainingNameKey) rather than a DB where clause, so curly-quote/
  // whitespace variants of the same training name are all matched, not just an exact string.
  const allRecords = await prisma.trainingRecord.findMany({
    select: { id: true, staffId: true, businessUnit: true, training: true },
  })
  const scoped = trainingName?.trim()
    ? allRecords.filter((r) => normalizeTrainingNameKey(r.training) === normalizeTrainingNameKey(trainingName))
    : allRecords

  let updated = 0
  let unchanged = 0
  let unresolved = 0
  const unresolvedStaffIds: string[] = []

  for (const r of scoped) {
    if (!r.staffId || r.staffId.startsWith('UNKNOWN_')) {
      unresolved++
      if (r.staffId) unresolvedStaffIds.push(r.staffId)
      continue
    }
    const staff = resolveStaff(r.staffId, directory)
    if (!staff) {
      unresolved++
      unresolvedStaffIds.push(r.staffId)
      continue
    }
    if (staff.businessUnit && staff.businessUnit !== r.businessUnit) {
      await prisma.trainingRecord.update({ where: { id: r.id }, data: { businessUnit: staff.businessUnit } })
      updated++
    } else {
      unchanged++
    }
  }

  return NextResponse.json({
    scopedTo: trainingName?.trim() || 'all trainings',
    totalChecked: scoped.length,
    updated,
    unchanged,
    unresolved,
    unresolvedStaffIds: [...new Set(unresolvedStaffIds)].slice(0, 20),
  })
}
