import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const RESPONDED_FIELD = { pre: 'preSurveyRespondedAt', post1: 'post1SurveyRespondedAt', post2: 'post2SurveyRespondedAt' } as const
const SENT_FIELD = { pre: 'preSurveySentAt', post1: 'post1SurveySentAt', post2: 'post2SurveySentAt' } as const

// Removes ONE side of a duplicate an admin reviewed in the Duplicate Survey Responses panel and
// chose to discard.
//
// Deletes the SurveyResponse row directly rather than its attendee — an attendee can legitimately
// hold responses for OTHER stages too (a real person's Pre/Post-1/Post-2 all live on one attendee
// row), so cascading through the attendee risks destroying data the duplicate group never showed
// the admin at all. The one exception: a "Legacy" import attendee is always created 1:1 with
// exactly one response (see import-legacy-manager-reviews/import-legacy-feedback), so once its
// only response is gone it's a purely synthetic leftover row — cleaned up here too rather than
// left behind.
//
// What happens to the linked structured record (FeedbackRecord for post1, ManagerReviewRecord for
// post2) depends on where the response came from:
//   - A "Legacy" import: the structured record IS real pre-existing source data (a
//     spreadsheet-uploaded review), not something this response created — so it's un-linked
//     (sourceResponseId reset to null) rather than deleted, leaving it as an un-imported candidate
//     an admin can still act on separately.
//   - A native submission: the structured record only exists BECAUSE of this response (see
//     upsertStructuredRecordForResponse), so it's removed too — there's no separate source data to
//     preserve, and leaving it behind would keep it in the dashboard's averages with nothing to
//     point back to.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ responseId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { responseId } = await params
  const response = await prisma.surveyResponse.findUnique({
    where: { id: responseId },
    include: { attendee: { include: { schedule: { select: { sourcedFromHistoricalData: true } }, responses: { select: { id: true, stage: true } } } } },
  })
  if (!response) return NextResponse.json({ error: 'Response not found.' }, { status: 404 })

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
    // Cascades to delete this SurveyResponse (see SurveyResponse.attendee onDelete: Cascade).
    await prisma.trainingScheduleAttendee.delete({ where: { id: response.attendeeId } })
  } else {
    await prisma.surveyResponse.delete({ where: { id: response.id } })
    // Reset this attendee's own sent/responded markers for the stage so it correctly shows as
    // "yet to fill" again instead of still counting toward "Filled" with no response behind it.
    await prisma.trainingScheduleAttendee.update({
      where: { id: response.attendeeId },
      data: { [RESPONDED_FIELD[stage]]: null, [SENT_FIELD[stage]]: null },
    })
  }

  return NextResponse.json({ success: true })
}
