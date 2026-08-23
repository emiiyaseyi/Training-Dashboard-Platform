import { prisma } from '@/lib/prisma'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { getOrCreateNativeBatch } from '@/lib/import-records'
import { MONTHS } from '@/lib/filter-types'

export interface BackfillResult {
  created: number
  alreadyMatched: number
  total: number
}

// One-time catch-up for schedules created before attendee-add started writing a TrainingRecord
// directly (see training-schedule/[id]/attendees/route.ts) — those attendees are still only
// visible in Manage Records/analytics once a Google Sheets sync happens to pick up their mirrored
// row. This finds every such attendee (linkedTrainingRecordId still null) and either links them
// to a matching TrainingRecord that a sync already created, or creates one now using the same
// field mapping the live dual-write uses.
export async function backfillTrainingRecordsFromSchedules(): Promise<BackfillResult> {
  const attendees = await prisma.trainingScheduleAttendee.findMany({
    where: { linkedTrainingRecordId: null, schedule: { sourcedFromHistoricalData: false } },
    include: { schedule: true },
  })

  let created = 0
  let alreadyMatched = 0
  const batch = attendees.length > 0 ? await getOrCreateNativeBatch('training', 'Training Schedule attendees (backfill)') : null

  for (const a of attendees) {
    const year = new Date().getFullYear()
    const month = MONTHS[a.schedule.startDate.getMonth()]

    // A sheet sync may have already picked this attendee up as an ordinary imported row before
    // this backfill ran — link to that instead of creating a duplicate.
    const existing = await prisma.trainingRecord.findFirst({
      where: { year, month, staffName: a.staffName, training: a.schedule.trainingName },
    })
    if (existing) {
      await prisma.trainingScheduleAttendee.update({ where: { id: a.id }, data: { linkedTrainingRecordId: existing.id } })
      alreadyMatched++
      continue
    }

    const record = await prisma.trainingRecord.create({
      data: {
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
        batchId: batch!.id,
      },
    })
    await prisma.trainingScheduleAttendee.update({ where: { id: a.id }, data: { linkedTrainingRecordId: record.id } })
    created++
  }

  return { created, alreadyMatched, total: attendees.length }
}
