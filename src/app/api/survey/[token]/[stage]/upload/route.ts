import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadFileToDrive } from '@/lib/google-drive'
import { isSurveyExpired } from '@/lib/survey-expiry'
import type { SurveyStageKey } from '@/lib/survey-questions'
import { rateLimit } from '@/lib/rate-limit'

const VALID_STAGES: SurveyStageKey[] = ['pre', 'post1', 'post2']

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

// Public, unauthenticated (same token-based access as the rest of the survey routes). Called by
// the form as soon as a file question's picker is used, ahead of the final submit — the returned
// Drive link becomes that question's answer value, same as any text answer.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; stage: string }> }) {
  const limited = rateLimit(req, 'survey-upload', 20, 60_000)
  if (limited) return limited

  try {
    const { token, stage } = await params
    if (!VALID_STAGES.includes(stage as SurveyStageKey)) {
      return NextResponse.json({ error: 'Unknown survey stage.' }, { status: 400 })
    }
    const stageKey = stage as SurveyStageKey

    const attendee = await prisma.trainingScheduleAttendee.findUnique({ where: { surveyToken: token } })
    if (!attendee) return NextResponse.json({ error: 'This survey link is invalid.' }, { status: 404 })
    if (attendee[RESPONDED_FIELD[stageKey]]) {
      return NextResponse.json({ error: 'This survey has already been submitted.' }, { status: 400 })
    }
    if (await isSurveyExpired(attendee[SENT_FIELD[stageKey]])) {
      return NextResponse.json({ error: 'This survey has expired.' }, { status: 400 })
    }

    const form = await req.formData()
    const file = form.get('file')
    const questionId = form.get('questionId')
    if (!(file instanceof File) || typeof questionId !== 'string') {
      return NextResponse.json({ error: 'A file and questionId are required.' }, { status: 400 })
    }
    const settings = await prisma.surveySettings.findFirst()
    const maxFileMB = settings?.maxFileUploadMB ?? 20
    if (file.size > maxFileMB * 1024 * 1024) {
      return NextResponse.json({ error: `File is too large (${maxFileMB}MB limit).` }, { status: 400 })
    }

    const question = await prisma.surveyQuestion.findUnique({ where: { id: questionId } })
    if (!question || question.stage !== stageKey || question.type !== 'file') {
      return NextResponse.json({ error: 'Unknown question for this survey.' }, { status: 400 })
    }
    if (!question.driveFolderId) {
      return NextResponse.json({ error: 'File uploads aren\'t configured for this question yet — contact your L&D team.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadFileToDrive(question.driveFolderId, file.name, file.type || 'application/octet-stream', buffer)

    return NextResponse.json({ fileId: result.fileId, fileName: file.name, webViewLink: result.webViewLink })
  } catch (err) {
    console.error('[survey upload]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed — please try again.' }, { status: 500 })
  }
}
