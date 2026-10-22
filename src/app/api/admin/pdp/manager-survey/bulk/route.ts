import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendMail, hasSmtpCredentials } from '@/lib/mailer'
import { getAppBaseUrl } from '@/lib/app-url'
import { buildPDPManagerTeamEmail } from '@/lib/pdp-email'

interface BulkBody { action: 'delete' | 'resend'; ids: string[] }

// Bulk checkbox-select delete/resend for Track B manager links, same convention as the Track A
// bulk route.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = (await req.json().catch(() => ({}))) as Partial<BulkBody>
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'No rows selected.' }, { status: 400 })

  if (body.action === 'delete') {
    const result = await prisma.pDPManagerSurvey.deleteMany({ where: { id: { in: ids } } })
    return NextResponse.json({ deleted: result.count })
  }

  if (body.action === 'resend') {
    if (!(await hasSmtpCredentials())) return NextResponse.json({ error: 'SMTP is not configured yet.' }, { status: 400 })
    const surveys = await prisma.pDPManagerSurvey.findMany({ where: { id: { in: ids } }, include: { cycle: true } })
    const baseUrl = getAppBaseUrl()
    let sent = 0
    const skipped: { name: string; reason: string }[] = []
    for (const s of surveys) {
      if (!s.email) { skipped.push({ name: s.managerName, reason: 'No email address on file.' }); continue }
      const { subject, html } = buildPDPManagerTeamEmail({ cycleTitle: s.cycle.title, managerName: s.managerName, formUrl: `${baseUrl}/survey/pdp-manager/${s.surveyToken}`, deadline: new Date(Date.now() + s.cycle.expiryDays * 86400000) })
      try {
        await sendMail({ to: s.email, subject, html })
        await prisma.pDPManagerSurvey.update({ where: { id: s.id }, data: { sentAt: new Date(), reminderAt: new Date() } })
        sent++
      } catch (err) {
        skipped.push({ name: s.managerName, reason: err instanceof Error ? err.message : 'Send failed.' })
      }
    }
    return NextResponse.json({ sent, skipped })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
