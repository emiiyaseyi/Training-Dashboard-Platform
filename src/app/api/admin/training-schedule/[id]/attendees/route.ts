import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff, resolveLineManager } from '@/lib/staff-directory'
import { mirrorAttendeesToTrainingData } from '@/lib/training-data-mirror'
import { getOrCreateNativeBatch } from '@/lib/import-records'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { MONTHS } from '@/lib/filter-types'
import type { TrainingScheduleAttendee } from '@prisma/client'

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

// Accepts a list of Staff IDs or emails, resolves each against the roster (name, email, line
// manager name/email) and adds them as attendees. Unresolvable identifiers are reported back
// rather than silently skipped, since a missing email means that person can never be surveyed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const { identifiers } = (await req.json()) as { identifiers: string[] }
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: 'Provide at least one Staff ID or email.' }, { status: 400 })
    }

    const schedule = await prisma.trainingSchedule.findUnique({ where: { id } })
    if (!schedule) return NextResponse.json({ error: 'Training schedule not found.' }, { status: 404 })

    const directory = await loadRosterDirectory()
    const added: string[] = []
    const notFound: string[] = []
    const noEmail: string[] = []
    const alreadyAdded: string[] = []
    const inactive: string[] = []
    const createdAttendees: TrainingScheduleAttendee[] = []

    for (const raw of identifiers) {
      const identifier = raw.trim()
      if (!identifier) continue
      const staff = resolveStaff(identifier, directory)
      if (!staff) {
        notFound.push(identifier)
        continue
      }
      // The search-to-add dropdown already excludes deactivated staff, but this also catches an
      // exact Staff ID/email typed in directly, bypassing that dropdown.
      if (!staff.active) {
        inactive.push(staff.name)
        continue
      }
      const manager = resolveLineManager(staff, directory)
      try {
        const attendee = await prisma.trainingScheduleAttendee.create({
          data: {
            scheduleId: id,
            staffId: staff.staffId,
            staffName: staff.name,
            email: staff.email,
            lineManagerName: manager?.name || null,
            lineManagerEmail: manager?.email || null,
          },
        })
        added.push(staff.name)
        createdAttendees.push(attendee)
        if (!staff.email) noEmail.push(staff.name)
      } catch (err) {
        // Same person already on this schedule — most often a retried request after an earlier
        // partial failure below, not a real duplicate the admin is trying to create on purpose.
        if (isUniqueConstraintError(err)) { alreadyAdded.push(staff.name); continue }
        throw err
      }
    }

    // Mirror all newly-added attendees into the Training Data sheet in one batch call — one
    // connect + read-headers + append round trip for the whole group, not one per attendee (which
    // is what made adding several people to a schedule slow). Outcome is persisted per attendee
    // (not just logged) so a failure is visible to the admin and retryable.
    // Skipped for schedules sourced from Already Attended Trainings — those attendees came FROM
    // an existing Training Data row, so mirroring them again would create a duplicate.
    let trainingRecordError: string | undefined
    if (!schedule.sourcedFromHistoricalData && createdAttendees.length > 0) {
      const results = await mirrorAttendeesToTrainingData(createdAttendees, schedule)
      await Promise.all(
        createdAttendees.map((attendee) => {
          const result = results.get(attendee.id)
          if (!result?.attempted) return null
          return prisma.trainingScheduleAttendee.update({
            where: { id: attendee.id },
            data: { trainingDataSyncedAt: result.success ? new Date() : null, trainingDataSyncError: result.success ? null : result.message },
          })
        })
      )

      // Also write a matching TrainingRecord for each attendee right now, using the exact same
      // field values just mirrored to the sheet — otherwise this schedule is invisible in Manage
      // Records (and every dashboard/analytics that reads TrainingRecord) until a Google Sheets
      // sync happens to run, which could be up to a day away on the free-tier cron. Using the same
      // values that were just mirrored means when a sheet sync DOES eventually run, reconcileTraining's
      // loose-key match (staffName+training+month) recognizes this as the row already being
      // imported — no duplicate, and no spurious "change" flagged unless something genuinely
      // differs in between.
      // Linked back onto the attendee (linkedTrainingRecordId) so removing the attendee later can
      // also remove this record instead of leaving a phantom row behind. Created one at a time
      // (not createMany) specifically so each new id can be captured for that link.
      // Kept in its own try/catch: the attendees themselves and the sheet mirror already succeeded
      // by this point, so a failure here — Business Unit lookup, a transient DB error — shouldn't
      // turn the whole request into an error the admin has to retry (which would re-attempt
      // already-succeeded work). It's surfaced in the response instead.
      try {
        const batch = await getOrCreateNativeBatch('training', 'Training Schedule attendees')
        for (const a of createdAttendees) {
          const record = await prisma.trainingRecord.create({
            data: {
              staffName: a.staffName,
              staffId: a.staffId,
              training: schedule.trainingName,
              businessUnit: normalizeBUName(schedule.businessUnit),
              month: MONTHS[schedule.startDate.getMonth()],
              year: new Date().getFullYear(),
              cost: schedule.costPerAttendee ?? 0,
              hours: schedule.hours,
              trainingType: schedule.trainingType,
              capability: schedule.capability,
              vendor: schedule.vendor,
              batchId: batch.id,
            },
          })
          await prisma.trainingScheduleAttendee.update({ where: { id: a.id }, data: { linkedTrainingRecordId: record.id } })
        }
      } catch (err) {
        console.error('[admin/training-schedule/attendees POST] TrainingRecord write failed', err)
        trainingRecordError = 'Attendees were added, but creating their Manage Records entry failed — they will still appear after the next Google Sheets sync.'
      }
    }

    return NextResponse.json({ added: added.length, notFound, noEmail, alreadyAdded, inactive, trainingRecordError })
  } catch (err) {
    console.error('[admin/training-schedule/attendees POST]', err)
    return NextResponse.json({ error: 'Failed to add attendees.' }, { status: 500 })
  }
}
