import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { addCustomSurveyRecipients } from '@/lib/custom-survey'

// Adds one or more people to a survey that's already launched — the original audience is only
// ever resolved once, at launch time, so this is the one way to bring in someone who was missed
// the first time (or is new to the org). Only for status "launched": a draft survey's audience
// is edited via PUT /api/admin/custom-surveys/[id] instead, and adding to a "closed" survey
// wouldn't make sense (reminders have already stopped for everyone).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.customSurvey.findUnique({ where: { id } })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
  if (survey.status !== 'launched') {
    return NextResponse.json({ error: 'Participants can only be added to a survey that has already been launched.' }, { status: 400 })
  }

  try {
    const { identifiers } = (await req.json()) as { identifiers: string[] }
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: 'Provide at least one Staff ID, email, or name.' }, { status: 400 })
    }
    const result = await addCustomSurveyRecipients(survey, identifiers)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/custom-surveys/[id]/recipients POST]', err)
    return NextResponse.json({ error: 'Failed to add participant(s).' }, { status: 500 })
  }
}
