import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendMail, hasSmtpCredentials } from '@/lib/mailer'
import { buildCustomSurveyEmail } from '@/lib/custom-survey-email'
import { getAppBaseUrl } from '@/lib/app-url'

// Manual per-recipient resend — a deliberate, individually-confirmed override (same rationale as
// the training surveys' per-attendee resend button), so it sends regardless of whether this
// person already responded or the survey has since expired.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  try {
    const { recipientId } = (await req.json()) as { recipientId: string }
    const [survey, recipient] = await Promise.all([
      prisma.customSurvey.findUnique({ where: { id } }),
      prisma.customSurveyRecipient.findUnique({ where: { id: recipientId } }),
    ])
    if (!survey || !recipient || recipient.surveyId !== id) {
      return NextResponse.json({ error: 'Survey or recipient not found.' }, { status: 404 })
    }
    if (!recipient.email) return NextResponse.json({ error: 'No email address on file for this recipient.' }, { status: 400 })
    if (!(await hasSmtpCredentials())) return NextResponse.json({ error: 'SMTP is not configured yet.' }, { status: 400 })

    const baseUrl = getAppBaseUrl()
    const { subject, html } = buildCustomSurveyEmail({
      title: survey.title,
      description: survey.description,
      recipientName: recipient.staffName,
      formUrl: `${baseUrl}/survey/custom/${recipient.surveyToken}`,
      isReminder: !!recipient.sentAt,
    })
    await sendMail({ to: recipient.email, subject, html })
    await prisma.customSurveyRecipient.update({
      where: { id: recipient.id },
      data: { sentAt: recipient.sentAt || new Date(), reminderAt: new Date() },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/custom-surveys/[id]/resend POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to resend.' }, { status: 500 })
  }
}
