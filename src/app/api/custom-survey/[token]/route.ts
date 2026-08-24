import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { isCustomSurveyExpired } from '@/lib/custom-survey'

// Public, unauthenticated — the token itself (an unguessable cuid) is the access control, same
// convention as /api/survey/[token]/[stage].
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'custom-survey-get', 60, 60_000)
  if (limited) return limited

  try {
    const { token } = await params
    const recipient = await prisma.customSurveyRecipient.findUnique({
      where: { surveyToken: token },
      include: { survey: { include: { questions: { orderBy: { order: 'asc' } } } } },
    })
    if (!recipient) return NextResponse.json({ error: 'This survey link is invalid or has expired.' }, { status: 404 })

    const alreadyResponded = !!recipient.respondedAt
    const expired = !alreadyResponded && isCustomSurveyExpired(recipient.survey, recipient.sentAt)
    const questions = alreadyResponded || expired ? [] : recipient.survey.questions

    return NextResponse.json({
      valid: true,
      title: recipient.survey.title,
      description: recipient.survey.description,
      recipientName: recipient.staffName,
      alreadyResponded,
      expired,
      questions: questions.map((q) => ({
        id: q.id,
        section: q.section,
        label: q.label,
        type: q.type,
        options: q.options ? JSON.parse(q.options) : null,
        ratingMax: q.ratingMax,
        required: q.required,
      })),
    })
  } catch (err) {
    console.error('[custom-survey GET]', err)
    return NextResponse.json({ error: 'Something went wrong loading this survey.' }, { status: 500 })
  }
}
