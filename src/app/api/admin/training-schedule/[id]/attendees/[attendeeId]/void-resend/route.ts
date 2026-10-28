import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendSurveyStage } from '@/lib/survey-send'

const RESPONDED_FIELD = {
  pre: 'preSurveyRespondedAt',
  post1: 'post1SurveyRespondedAt',
  post2: 'post2SurveyRespondedAt',
} as const

type Stage = keyof typeof RESPONDED_FIELD

// "Void & re-trigger": an already-submitted survey stage is thrown away so the same person can fill
// it again. The respondent just gets an ordinary fresh email (same link, no "void"/"reminder"
// wording) and, once they resubmit, the new answers take the old ones' place — the previous
// SurveyResponse and the Feedback/ManagerReview record it produced are removed here, and the submit
// route creates the replacements.
//
// The email goes out FIRST: if it can't be sent (no address, SMTP down), nothing is voided and the
// original answers stay intact.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; attendeeId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id: scheduleId, attendeeId } = await params
    const { stage } = (await req.json()) as { stage?: Stage }
    if (!stage || !(stage in RESPONDED_FIELD)) {
      return NextResponse.json({ error: 'stage must be one of: pre, post1, post2.' }, { status: 400 })
    }

    const attendee = await prisma.trainingScheduleAttendee.findFirst({
      where: { id: attendeeId, scheduleId },
      include: { schedule: { select: { sourcedFromHistoricalData: true } }, responses: { where: { stage }, select: { id: true } } },
    })
    if (!attendee) return NextResponse.json({ error: 'Attendee not found.' }, { status: 404 })

    // skipDefaultCc: this is a correction for one person, not a first nomination — don't re-copy the default Cc.
    const result = await sendSurveyStage(scheduleId, stage, [attendeeId], false, true)
    if (result.sent === 0) {
      return NextResponse.json({ error: result.skipped[0]?.reason || 'The email could not be sent, so nothing was voided.' }, { status: 400 })
    }

    const isLegacyImport = attendee.schedule.sourcedFromHistoricalData
    for (const r of attendee.responses) {
      if (stage === 'post1') {
        const linked = await prisma.feedbackRecord.findUnique({ where: { sourceResponseId: r.id } })
        if (linked) {
          if (isLegacyImport) await prisma.feedbackRecord.update({ where: { id: linked.id }, data: { sourceResponseId: null } })
          else await prisma.feedbackRecord.delete({ where: { id: linked.id } })
        }
      } else if (stage === 'post2') {
        const linked = await prisma.managerReviewRecord.findUnique({ where: { sourceResponseId: r.id } })
        if (linked) {
          if (isLegacyImport) await prisma.managerReviewRecord.update({ where: { id: linked.id }, data: { sourceResponseId: null } })
          else await prisma.managerReviewRecord.delete({ where: { id: linked.id } })
        }
      }
      await prisma.surveyResponse.delete({ where: { id: r.id } })
    }
    await prisma.trainingScheduleAttendee.update({ where: { id: attendeeId }, data: { [RESPONDED_FIELD[stage]]: null } })

    return NextResponse.json({ success: true, voided: attendee.responses.length })
  } catch (err) {
    console.error('[admin/training-schedule/attendees/void-resend POST]', err)
    return NextResponse.json({ error: 'Failed to void and re-trigger this survey.' }, { status: 500 })
  }
}
