import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { surveyRecipientRole } from '@/lib/survey-email'
import type { SurveyStage } from '@/lib/survey-email'
import { getStageQuestions, type SurveyStageKey } from '@/lib/survey-questions'
import { isSurveyExpired } from '@/lib/survey-expiry'

const VALID_STAGES: SurveyStage[] = ['pre', 'post1', 'post2']

const RESPONDED_FIELD = {
  pre: 'preSurveyRespondedAt',
  post1: 'post1SurveyRespondedAt',
  post2: 'post2SurveyRespondedAt',
} as const

const SENT_FIELD = {
  pre: 'preSurveySentAt',
  post1: 'post1SurveySentAt',
  post2: 'post2SurveySentAt',
} as const

// Public, unauthenticated — the token itself (an unguessable cuid) is the access control.
// Returns just enough context to render the form: who it's for, which training, whether it's
// already been submitted, and whether the viewer should be addressed as the employee or manager.
export async function GET(req: Request, { params }: { params: Promise<{ token: string; stage: string }> }) {
  try {
    const { token, stage } = await params
    if (!VALID_STAGES.includes(stage as SurveyStage)) {
      return NextResponse.json({ error: 'Unknown survey stage.' }, { status: 400 })
    }
    const stageKey = stage as SurveyStage

    const attendee = await prisma.trainingScheduleAttendee.findUnique({
      where: { surveyToken: token },
      include: { schedule: true },
    })
    if (!attendee) {
      return NextResponse.json({ error: 'This survey link is invalid or has expired.' }, { status: 404 })
    }

    const recipientRole = surveyRecipientRole(stageKey)
    const alreadyResponded = !!attendee[RESPONDED_FIELD[stageKey]]
    const expired = !alreadyResponded && (await isSurveyExpired(attendee[SENT_FIELD[stageKey]]))
    const questions = alreadyResponded || expired ? [] : await getStageQuestions(stageKey as SurveyStageKey)

    const autoFillValues: Record<string, string> = {
      trainingName: attendee.schedule.trainingName,
      businessUnit: attendee.schedule.businessUnit,
      employeeName: attendee.staffName,
      role: '',
      recipientName: recipientRole === 'manager' ? attendee.lineManagerName || '' : attendee.staffName,
    }

    return NextResponse.json({
      valid: true,
      stage,
      recipientRole,
      recipientName: recipientRole === 'manager' ? attendee.lineManagerName : attendee.staffName,
      employeeName: attendee.staffName,
      trainingName: attendee.schedule.trainingName,
      businessUnit: attendee.schedule.businessUnit,
      alreadyResponded,
      expired,
      questions: questions.map((q) => ({
        id: q.id,
        section: q.section,
        label: q.label,
        type: q.type,
        options: q.options ? JSON.parse(q.options) : null,
        required: q.required,
        autoFill: q.autoFill,
      })),
      autoFillValues,
    })
  } catch (err) {
    console.error('[survey GET]', err)
    return NextResponse.json({ error: 'Something went wrong loading this survey.' }, { status: 500 })
  }
}
