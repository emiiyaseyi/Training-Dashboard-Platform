import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff, resolveStaffLoose } from '@/lib/staff-directory'
import { normalizeBUName } from '@/lib/bu-normalizer'

// Fills in Staff ID, Business Unit, and Email on any TrainingRecord left blank by whatever
// originally created it (an upload/sync row that came from a sheet missing those columns) — the
// same information is already complete on the person's Employee record, this just carries it
// over. Only ever fills a blank; never overwrites a value that's already there. Matches by Staff
// ID when the record has one, otherwise falls back to an exact name match against the roster —
// same "identifier or name" resolution Staff Data Quality's own fill-from-sheet action uses.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const directory = await loadRosterDirectory()
    const records = await prisma.trainingRecord.findMany({
      where: {
        OR: [{ staffId: '' }, { businessUnit: '' }, { email: null }, { email: '' }],
      },
    })

    let filled = 0
    let unmatched = 0
    const ops: ReturnType<typeof prisma.trainingRecord.update>[] = []

    for (const r of records) {
      const staff = r.staffId.trim()
        ? resolveStaff(r.staffId, directory)
        : resolveStaffLoose(r.staffName, directory)

      if (!staff) { unmatched++; continue }

      const data: { staffId?: string; businessUnit?: string; email?: string } = {}
      if (!r.staffId.trim() && staff.staffId) data.staffId = staff.staffId
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
