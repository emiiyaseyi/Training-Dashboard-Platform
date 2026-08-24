import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadFileToDrive } from '@/lib/google-drive'
import { isCustomSurveyExpired } from '@/lib/custom-survey'
import { rateLimit } from '@/lib/rate-limit'

// Public, unauthenticated (token-based access, same as the training surveys' upload route).
// Called as soon as a file question's picker is used, ahead of the final submit.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'custom-survey-upload', 20, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const recipient = await prisma.customSurveyRecipient.findUnique({ where: { surveyToken: token }, include: { survey: true } })
    if (!recipient) return NextResponse.json({ error: 'This survey link is invalid.' }, { status: 404 })
    if (recipient.respondedAt) return NextResponse.json({ error: 'This survey has already been submitted.' }, { status: 400 })
    if (isCustomSurveyExpired(recipient.survey, recipient.sentAt)) {
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

    const question = await prisma.customSurveyQuestion.findUnique({ where: { id: questionId } })
    if (!question || question.surveyId !== recipient.surveyId || question.type !== 'file') {
      return NextResponse.json({ error: 'Unknown question for this survey.' }, { status: 400 })
    }
    if (!question.driveFolderId) {
      return NextResponse.json({ error: 'File uploads aren\'t configured for this question yet — contact your L&D team.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await uploadFileToDrive(question.driveFolderId, file.name, file.type || 'application/octet-stream', buffer)

    return NextResponse.json({ fileId: result.fileId, fileName: file.name, webViewLink: result.webViewLink })
  } catch (err) {
    console.error('[custom-survey upload]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed — please try again.' }, { status: 500 })
  }
}
