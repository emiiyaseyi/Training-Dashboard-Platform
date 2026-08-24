import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { getOrCreateNativeBatch } from '@/lib/import-records'
import { MONTHS } from '@/lib/filter-types'
import type { Prisma } from '@prisma/client'

export interface BackfillResult {
  created: number
  alreadyMatched: number
  total: number
}

const looseKey = (staffName: string, training: string, month: string) =>
  `${staffName.trim().toLowerCase()}|${training.trim().toLowerCase()}|${month.trim().toLowerCase()}`

// One-time catch-up for schedules created before attendee-add started writing a TrainingRecord
// directly (see training-schedule/[id]/attendees/route.ts) — those attendees are still only
// visible in Manage Records/analytics once a Google Sheets sync happens to pick up their mirrored
// row. This finds every such attendee (linkedTrainingRecordId still null) and either links them
// to a matching TrainingRecord that a sync already created, or creates one now using the same
// field mapping the live dual-write uses.
//
// Batched deliberately: an earlier version did a findFirst + create/update PER attendee (up to 3
// sequential DB round trips each), which for a few hundred backlogged attendees could run long
// enough to hit a serverless function timeout — the request would die server-side while the
// client kept spinning, looking exactly like the page had hung. This does one read for all
// existing records, matches in memory, then applies everything in a single transaction.
export async function backfillTrainingRecordsFromSchedules(): Promise<BackfillResult> {
  const attendees = await prisma.trainingScheduleAttendee.findMany({
    where: { linkedTrainingRecordId: null, schedule: { sourcedFromHistoricalData: false } },
    include: { schedule: true },
  })
  if (attendees.length === 0) return { created: 0, alreadyMatched: 0, total: 0 }

  const year = new Date().getFullYear()
  const existingRecords = await prisma.trainingRecord.findMany({
    where: { year },
    select: { id: true, staffName: true, training: true, month: true },
  })
  const existingByKey = new Map<string, string>()
  existingRecords.forEach((r) => {
    const key = looseKey(r.staffName, r.training, r.month)
    if (!existingByKey.has(key)) existingByKey.set(key, r.id)
  })

  const batch = await getOrCreateNativeBatch('training', 'Training Schedule attendees (backfill)')

  let created = 0
  let alreadyMatched = 0
  const ops: Prisma.PrismaPromise<unknown>[] = []

  for (const a of attendees) {
    const month = MONTHS[a.schedule.startDate.getMonth()]
    const key = looseKey(a.staffName, a.schedule.trainingName, month)
    const existingId = existingByKey.get(key)

    if (existingId) {
      alreadyMatched++
      ops.push(prisma.trainingScheduleAttendee.update({ where: { id: a.id }, data: { linkedTrainingRecordId: existingId } }))
      continue
    }

    created++
    const newId = randomUUID()
    ops.push(
      prisma.trainingRecord.create({
        data: {
          id: newId,
          staffName: a.staffName,
          staffId: a.staffId,
          training: a.schedule.trainingName,
          businessUnit: normalizeBUName(a.schedule.businessUnit),
          month,
          year,
          cost: a.schedule.costPerAttendee ?? 0,
          hours: a.schedule.hours,
          trainingType: a.schedule.trainingType,
          capability: a.schedule.capability,
          vendor: a.schedule.vendor,
          batchId: batch.id,
        },
      })
    )
    ops.push(prisma.trainingScheduleAttendee.update({ where: { id: a.id }, data: { linkedTrainingRecordId: newId } }))
  }

  await prisma.$transaction(ops)

  return { created, alreadyMatched, total: attendees.length }
}
