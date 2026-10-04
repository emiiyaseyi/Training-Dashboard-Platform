import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { archiveDeletedRecord } from '@/lib/deleted-records'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { normalizeTrainingNameKey } from '@/lib/training-name'
import { firstLastNameKey } from '@/lib/staff-name'

// Bulk version of the single-record delete, for the Possible Duplicate Trainings panel's
// checkbox-based "select which to keep / which to delete" flow. The admin may tick any mix of
// records across any number of duplicate groups in one go — this isn't limited to "keep exactly
// one per group" the way the older resolve/route.ts flow is.
//
// Same person+training grouping key as possible-duplicates/route.ts, used only to find a
// survivor to repoint a deleted record's linked schedule attendee to (so a schedule doesn't go
// dangling just because the record it was auto-linked to got bulk-deleted). If nothing survives
// in that group, the link is cleared instead of left pointing at a deleted id.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { ids } = (await req.json()) as { ids?: string[] }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids is required.' }, { status: 400 })
    }

    const toDelete = await prisma.trainingRecord.findMany({ where: { id: { in: ids } } })
    if (toDelete.length === 0) {
      return NextResponse.json({ error: 'No matching records found.' }, { status: 404 })
    }

    const groupKeyOf = (r: { staffId: string; staffName: string; training: string }) =>
      `${normalizeStaffIdKey(r.staffId) || firstLastNameKey(r.staffName)}|${normalizeTrainingNameKey(r.training)}`

    const deleteIdSet = new Set(toDelete.map((r) => r.id))
    const survivorsByGroupKey = new Map<string, string>()
    for (const r of toDelete) {
      const key = groupKeyOf(r)
      if (survivorsByGroupKey.has(key)) continue
      const survivor = await prisma.trainingRecord.findFirst({
        where: { staffId: r.staffId, training: r.training, id: { notIn: [...deleteIdSet] } },
      })
      if (survivor) survivorsByGroupKey.set(key, survivor.id)
    }

    let relinked = 0
    for (const r of toDelete) {
      const survivorId = survivorsByGroupKey.get(groupKeyOf(r))
      if (survivorId) {
        const result = await prisma.trainingScheduleAttendee.updateMany({
          where: { linkedTrainingRecordId: r.id },
          data: { linkedTrainingRecordId: survivorId },
        })
        relinked += result.count
      } else {
        await prisma.trainingScheduleAttendee.updateMany({
          where: { linkedTrainingRecordId: r.id },
          data: { linkedTrainingRecordId: null },
        })
      }
    }

    for (const record of toDelete) {
      await archiveDeletedRecord(
        'training',
        record,
        { name: gate.user.name, email: gate.user.email },
        [
          { columnCandidates: ['staffid', 'staffno', 'employeeid', 'employeeno', 'id'], value: record.staffId },
          { columnCandidates: ['training', 'trainingname', 'trainingtitle', 'course', 'programme'], value: record.training },
          { columnCandidates: ['month', 'period', 'trainingmonth'], value: record.month },
        ],
      )
    }

    const { count } = await prisma.trainingRecord.deleteMany({ where: { id: { in: [...deleteIdSet] } } })

    return NextResponse.json({ deleted: count, relinked })
  } catch (err) {
    console.error('[admin/records/training/possible-duplicates/bulk-delete POST]', err)
    return NextResponse.json({ error: 'Failed to bulk delete records.' }, { status: 500 })
  }
}
