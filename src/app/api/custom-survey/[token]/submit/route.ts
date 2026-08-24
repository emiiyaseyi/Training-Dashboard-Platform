import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { isCustomSurveyExpired } from '@/lib/custom-survey'
import { mirrorCustomSurveyResponse } from '@/lib/custom-survey-mirror'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'custom-survey-submit', 20, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const recipient = await prisma.customSurveyRecipient.findUnique({
      where: { surveyToken: token },
      include: { survey: { include: { questions: { orderBy: { order: 'asc' } } } } },
    })
    if (!recipient) return NextResponse.json({ error: 'This survey link is invalid or has expired.' }, { status: 404 })
    if (recipient.respondedAt) return NextResponse.json({ error: 'This survey has already been submitted.' }, { status: 400 })
    if (isCustomSurveyExpired(recipient.survey, recipient.sentAt)) {
      return NextResponse.json({ error: 'This survey has expired and can no longer accept responses.' }, { status: 400 })
    }

    const { answers } = (await req.json()) as { answers: Record<string, string | string[]> }
    const questions = recipient.survey.questions

    const missing = questions.filter((q) => q.required && !answers[q.id]?.toString().trim())
    if (missing.length > 0) {
      return NextResponse.json({ error: `Please answer: ${missing.map((q) => q.label).join(', ')}` }, { status: 400 })
    }

    const response = await prisma.customSurveyResponse.create({
      data: { recipientId: recipient.id, answers: JSON.stringify(answers) },
    })
    await prisma.customSurveyRecipient.update({ where: { id: recipient.id }, data: { respondedAt: new Date() } })

    const mirrorResult = await mirrorCustomSurveyResponse(recipient.survey, recipient, answers, questions, response.submittedAt)
    if (mirrorResult.attempted) {
      await prisma.customSurveyResponse.update({
        where: { id: response.id },
        data: { mirrorSyncedAt: mirrorResult.success ? new Date() : null, mirrorError: mirrorResult.success ? null : mirrorResult.message },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[custom-survey submit]', err)
    return NextResponse.json({ error: 'Failed to submit — please try again.' }, { status: 500 })
  }
}
