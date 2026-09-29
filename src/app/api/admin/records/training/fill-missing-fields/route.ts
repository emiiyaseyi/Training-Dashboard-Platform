import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff, resolveStaffLoose } from '@/lib/staff-directory'
import { normalizeBUName } from '@/lib/bu-normalizer'

// A row uploaded with no Staff ID at all gets stamped "UNKNOWN_<n>" at import time (see
// excel-parser.ts) rather than left truly blank — useful there so every row keeps a unique
// identity, but useless as an actual Staff ID for matching against the roster. Treated the same
// as blank everywhere in this route.
const isPlaceholderStaffId = (staffId: string) => !staffId.trim() || staffId.trim().toUpperCase().startsWith('UNKNOWN_')

// Fills in Staff ID, Business Unit, and Email on any TrainingRecord left blank (or stuck with a
// placeholder Staff ID) by whatever originally created it — the same information is already
// complete on the person's Employee record, this just carries it over. Only ever fills a blank;
// never overwrites a value that's already there. Matches by Staff ID when the record has a real
// one, otherwise falls back to an exact name match against the roster — same "identifier or name"
// resolution Staff Data Quality's own fill-from-sheet action uses.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const directory = await loadRosterDirectory()
    const records = await prisma.trainingRecord.findMany({
      where: {
        OR: [{ staffId: '' }, { staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { email: null }, { email: '' }],
      },
    })

    let filled = 0
    let unmatched = 0
    const ops: ReturnType<typeof prisma.trainingRecord.update>[] = []

    for (const r of records) {
      const staffIdIsPlaceholder = isPlaceholderStaffId(r.staffId)
      const staff = staffIdIsPlaceholder
        ? resolveStaffLoose(r.staffName, directory)
        : resolveStaff(r.staffId, directory)

      if (!staff) { unmatched++; continue }

      const data: { staffId?: string; businessUnit?: string; email?: string } = {}
      if (staffIdIsPlaceholder && staff.staffId) data.staffId = staff.staffId
      if (!r.businessUnit.trim() && staff.businessUnit) data.businessUnit = normalizeBUName(staff.businessUnit)
      if (!r.email?.trim() && staff.email) data.email = staff.email

      if (Object.keys(data).length === 0) continue
      filled++
      ops.push(prisma.trainingRecord.update({ where: { id: r.id }, data }))
    }

    if (ops.length > 0) await prisma.$transaction(ops)

    return NextResponse.json({ scanned: records.length, filled, unmatched })
  } catch (err) {
    console.error('[admin/records/training/fill-missing-fields POST]', err)
    return NextResponse.json({ error: 'Failed to fill missing fields.' }, { status: 500 })
  }
}
