import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendCustomSurveyReminders } from '@/lib/custom-survey'

// Manual trigger for the same reminder sweep the daily cron (send-surveys) runs automatically —
// lets an admin nudge unfilled recipients right now instead of waiting on / debugging the cron
// (e.g. Vercel Cron misconfiguration, SMTP outage) when someone reports they haven't gotten a
// reminder. Still respects the normal once-per-calendar-day and expiryDays gating inside
// sendCustomSurveyReminders — this doesn't spam anyone who was already nudged today.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.customSurvey.findUnique({ where: { id }, include: { recipients: true } })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
  if (survey.status !== 'launched') {
    return NextResponse.json({ error: 'Only a launched survey can send reminders.' }, { status: 400 })
  }

  const settings = await prisma.surveySettings.findFirst()
  const result = await sendCustomSurveyReminders(survey, settings?.excludeDefaultCcOnReminders ?? true)
  return NextResponse.json(result)
}
