import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { sendMail } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { to } = (await req.json()) as { to?: string }
    if (!to?.trim()) return NextResponse.json({ error: 'Enter an email address to send the test to.' }, { status: 400 })

    const settings = await prisma.surveySettings.findFirst()
    await sendMail({
      to: to.trim(),
      subject: 'Test email — Learning Intelligence Dashboard',
      html: '<p>This is a test email from the Learning Intelligence Dashboard’s survey automation settings. If you received this, SMTP is configured correctly.</p>',
      fromName: settings?.fromName,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/survey-settings/test-email]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to send test email.' }, { status: 500 })
  }
}
