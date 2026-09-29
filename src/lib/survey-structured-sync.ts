import { prisma } from '@/lib/prisma'
import { MONTHS } from '@/lib/filter-types'
import { getOrCreateNativeBatch } from '@/lib/import-records'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'
import type { SurveyStageKey } from '@/lib/survey-questions'
import type { SurveyQuestion, TrainingScheduleAttendee, TrainingSchedule } from '@prisma/client'

type AnswerMap = Record<string, string | string[]>

function currentMonthName(): string {
  return MONTHS[new Date().getMonth()]
}

const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v || '')
const asNumber = (v: string | string[] | undefined) => {
  const n = parseFloat(Array.isArray(v) ? '' : v || '')
  return isNaN(n) ? 0 : n
}

// Post-1/Post-2 answers feed a structured FeedbackRecord/ManagerReviewRecord row (see submit
// route) — those, not the raw SurveyResponse.answers JSON, are what the dashboard's analytics
// actually read. Shared by the submit route (creates the row) and the admin response editor
// (needs the SAME field mapping to recompute an existing row after an edit), so the two can never
// drift out of sync with each other.
export async function upsertStructuredRecordForResponse(
  stageKey: SurveyStageKey,
  attendee: TrainingScheduleAttendee & { schedule: TrainingSchedule },
  answers: AnswerMap,
  questions: SurveyQuestion[],
  responseId: string
): Promise<void> {
  const fieldAnswer = (fieldKey: string) => {
    const q = questions.find((q) => q.fieldKey === fieldKey)
    return q ? answers[q.id] : undefined
  }

  // Same resolution used by the live survey form and its sheet mirror (see /api/survey/[token]/
  // [stage] route): prefer the attendee's OWN CURRENT roster Business Unit over the training
  // schedule's one shared value. Storing the schedule's BU here instead was exactly what made a
  // per-BU report card (e.g. "Post-Training Impact") disagree with a same-BU filtered view of the
  // underlying responses — a respondent whose roster BU changed since the training, or who was on
  // a mixed-BU schedule, would get grouped differently by the two views.
  const directory = await loadRosterDirectory()
  const staff = resolveStaff(attendee.staffId, directory)
  const businessUnit = staff?.businessUnit || attendee.schedule.businessUnit

  if (stageKey === 'post1') {
    const data = {
      staffId: attendee.staffId,
      businessUnit,
      trainingTitle: attendee.schedule.trainingName,
      applicationResponse: asText(fieldAnswer('applicationResponse')),
      impactAlignment: asText(fieldAnswer('impactAlignment')),
      confidenceRating: asNumber(fieldAnswer('confidenceRating')),
      roleRelevance: asNumber(fieldAnswer('roleRelevance')),
      expectationsMet: asNumber(fieldAnswer('expectationsMet')),
      vendorRating: asNumber(fieldAnswer('vendorRating')),
      vendorName: asText(fieldAnswer('vendorName')),
      qualitativeResponse: asText(fieldAnswer('qualitativeResponse')),
    }
    const existing = await prisma.feedbackRecord.findUnique({ where: { sourceResponseId: responseId } })
    if (existing) {
      await prisma.feedbackRecord.update({ where: { id: existing.id }, data })
    } else {
      // No existing row — this response predates the sourceResponseId link (submitted before
      // this feature shipped). Create one now so the edit still reaches the dashboard, rather
      // than silently updating only the raw answers.
      const batch = await getOrCreateNativeBatch('feedback', 'Native Survey Responses (Post-1)')
      await prisma.feedbackRecord.create({ data: { ...data, role: null, month: currentMonthName(), batchId: batch.id, sourceResponseId: responseId } })
      await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: 1 } } })
    }
  } else if (stageKey === 'post2') {
    const data = {
      staffId: attendee.staffId,
      staffName: attendee.staffName,
      businessUnit,
      training: attendee.schedule.trainingName,
      managerName: attendee.lineManagerName,
      impactScore: asNumber(fieldAnswer('impactScore')),
      comments: asText(fieldAnswer('comments')) || null,
    }
    const existing = await prisma.managerReviewRecord.findUnique({ where: { sourceResponseId: responseId } })
    if (existing) {
      await prisma.managerReviewRecord.update({ where: { id: existing.id }, data })
    } else {
      const batch = await getOrCreateNativeBatch('manager-review', 'Native Survey Responses (Post-2)')
      await prisma.managerReviewRecord.create({ data: { ...data, month: currentMonthName(), batchId: batch.id, sourceResponseId: responseId } })
      await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: 1 } } })
    }
  }
}
