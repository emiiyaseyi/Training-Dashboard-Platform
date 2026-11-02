import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { NEW_HIRE_QUESTIONS, NEW_HIRE_SURVEY_TITLE, NEW_HIRE_SURVEY_INTRO } from '@/lib/new-hire-survey'

// Public, token-gated — no session check, same convention as every other survey/validation
// token route in this app (the unguessable token is the access control).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const survey = await prisma.newHireExperienceSurvey.findUnique({ where: { surveyToken: token } })
  if (!survey) return NextResponse.json({ error: 'This survey link is invalid.' }, { status: 404 })
  return NextResponse.json({
    title: NEW_HIRE_SURVEY_TITLE,
    intro: NEW_HIRE_SURVEY_INTRO,
    questions: NEW_HIRE_QUESTIONS,
    staffName: survey.staffName,
    submitted: survey.respondedAt !== null,
    answers: survey.answers ? JSON.parse(survey.answers) : null,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const survey = await prisma.newHireExperienceSurvey.findUnique({ where: { surveyToken: token } })
  if (!survey) return NextResponse.json({ error: 'This survey link is invalid.' }, { status: 404 })
  if (survey.respondedAt) return NextResponse.json({ error: 'This survey has already been submitted.' }, { status: 409 })

  const body = await req.json().catch(() => null)
  const answers = body?.answers
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Missing answers.' }, { status: 400 })
  }
  for (const q of NEW_HIRE_QUESTIONS) {
    const value = answers[q.id]
    if (typeof value !== 'string' || !value.trim()) {
      return NextResponse.json({ error: `"${q.label}" is required.` }, { status: 400 })
    }
    if (q.options && !q.options.includes(value)) {
      return NextResponse.json({ error: `Invalid answer for "${q.label}".` }, { status: 400 })
    }
  }

  await prisma.newHireExperienceSurvey.update({
    where: { id: survey.id },
    data: { answers: JSON.stringify(answers), respondedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
