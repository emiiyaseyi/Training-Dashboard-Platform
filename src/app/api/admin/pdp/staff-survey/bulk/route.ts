import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendMail, hasSmtpCredentials } from '@/lib/mailer'
import { getAppBaseUrl } from '@/lib/app-url'
import { buildPDPStaffEmail } from '@/lib/pdp-email'

interface BulkBody { action: 'delete' | 'resend'; ids: string[] }

// Bulk checkbox-select actions for the Track A response report, mirroring Survey Automation's
// per-attendee resend/delete pattern but applied to a set of selected rows at once instead of one
// at a time. "resend" always re-sends regardless of current sentAt/respondedAt — an explicit admin
// action, not the reminder sweep, so it works even for someone who already responded (e.g. they
// lost the email and want to review/edit).
export async function POST(req: NextRequest) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = (await req.json().catch(() => ({}))) as Partial<BulkBody>
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'No rows selected.' }, { status: 400 })

  if (body.action === 'delete') {
    const result = await prisma.pDPStaffSurvey.deleteMany({ where: { id: { in: ids } } })
    return NextResponse.json({ deleted: result.count })
  }

  if (body.action === 'resend') {
    if (!(await hasSmtpCredentials())) return NextResponse.json({ error: 'SMTP is not configured yet.' }, { status: 400 })
    const surveys = await prisma.pDPStaffSurvey.findMany({ where: { id: { in: ids } }, include: { cycle: true } })
    const baseUrl = getAppBaseUrl()
    let sent = 0
    const skipped: { name: string; reason: string }[] = []
    for (const s of surveys) {
      if (!s.email) { skipped.push({ name: s.staffName, reason: 'No email address on file.' }); continue }
      const { subject, html } = buildPDPStaffEmail({ cycleTitle: s.cycle.title, recipientName: s.staffName, formUrl: `${baseUrl}/survey/pdp/${s.surveyToken}` })
      try {
        await sendMail({ to: s.email, subject, html })
        await prisma.pDPStaffSurvey.update({ where: { id: s.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
        sent++
      } catch (err) {
        skipped.push({ name: s.staffName, reason: err instanceof Error ? err.message : 'Send failed.' })
      }
    }
    return NextResponse.json({ sent, skipped })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
