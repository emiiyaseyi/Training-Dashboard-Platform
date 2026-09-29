import { prisma } from '@/lib/prisma'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'

const RESPONDED_FIELD = { pre: 'preSurveyRespondedAt', post1: 'post1SurveyRespondedAt', post2: 'post2SurveyRespondedAt' } as const
const SENT_FIELD = { pre: 'preSurveySentAt', post1: 'post1SurveySentAt', post2: 'post2SurveySentAt' } as const

export interface DuplicateEntry {
  responseId: string
  attendeeId: string
  staffId: string
  staffName: string
  businessUnit: string
  trainingName: string
  stage: string
  submittedAt: string
  isLegacyImport: boolean
}

// Shared by the duplicate-responses GET (list for review) and the bulk-delete route, so both agree
// on exactly what counts as a duplicate group.
export async function findDuplicateResponseGroups(): Promise<DuplicateEntry[][]> {
  const attendees = await prisma.trainingScheduleAttendee.findMany({
    where: { responses: { some: {} } },
    include: {
      schedule: { select: { trainingName: true, sourcedFromHistoricalData: true } },
      responses: { select: { id: true, stage: true, submittedAt: true } },
    },
  })

  const directory = await loadRosterDirectory()

  const groups = new Map<string, DuplicateEntry[]>()
  for (const a of attendees) {
    const staff = resolveStaff(a.staffId, directory)
    for (const r of a.responses) {
      const key = `${r.stage}|${normalizeStaffIdKey(a.staffId)}|${a.schedule.trainingName.trim().toLowerCase()}`
      const list = groups.get(key) || []
      list.push({
        responseId: r.id,
        attendeeId: a.id,
        staffId: a.staffId,
        staffName: a.staffName,
        businessUnit: staff?.businessUnit || '',
        trainingName: a.schedule.trainingName,
        stage: r.stage,
        submittedAt: r.submittedAt.toISOString(),
        isLegacyImport: a.schedule.sourcedFromHistoricalData,
      })
      groups.set(key, list)
    }
  }

  return [...groups.values()]
    .filter((entries) => entries.length > 1)
    .map((entries) => entries.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)))
    .sort((a, b) => a[0].trainingName.localeCompare(b[0].trainingName))
}

// Removes ONE duplicate entry — shared by the single-entry DELETE route and the "keep newest,
// delete the rest" bulk action. See duplicate-responses/[responseId]/route.ts for the full
// reasoning behind deleting the response directly (not the attendee, except for a legacy-import
// attendee left with nothing else on it) and unlinking vs. deleting the record it fed.
export async function deleteResponseEntry(responseId: string): Promise<void> {
  const response = await prisma.surveyResponse.findUnique({
    where: { id: responseId },
    include: { attendee: { include: { schedule: { select: { sourcedFromHistoricalData: true } }, responses: { select: { id: true, stage: true } } } } },
  })
  if (!response) return

  const isLegacyImport = response.attendee.schedule.sourcedFromHistoricalData
  const stage = response.stage as 'pre' | 'post1' | 'post2'

  if (stage === 'post2') {
    const linked = await prisma.managerReviewRecord.findUnique({ where: { sourceResponseId: response.id } })
    if (linked) {
      if (isLegacyImport) await prisma.managerReviewRecord.update({ where: { id: linked.id }, data: { sourceResponseId: null } })
      else await prisma.managerReviewRecord.delete({ where: { id: linked.id } })
    }
  } else if (stage === 'post1') {
    const linked = await prisma.feedbackRecord.findUnique({ where: { sourceResponseId: response.id } })
    if (linked) {
      if (isLegacyImport) await prisma.feedbackRecord.update({ where: { id: linked.id }, data: { sourceResponseId: null } })
      else await prisma.feedbackRecord.delete({ where: { id: linked.id } })
    }
  }

  const isOnlyResponseOnThisAttendee = response.attendee.responses.length === 1

  if (isLegacyImport && isOnlyResponseOnThisAttendee) {
    await prisma.trainingScheduleAttendee.delete({ where: { id: response.attendeeId } })
  } else {
    await prisma.surveyResponse.delete({ where: { id: response.id } })
    await prisma.trainingScheduleAttendee.update({
      where: { id: response.attendeeId },
      data: { [RESPONDED_FIELD[stage]]: null, [SENT_FIELD[stage]]: null },
    })
  }
}
