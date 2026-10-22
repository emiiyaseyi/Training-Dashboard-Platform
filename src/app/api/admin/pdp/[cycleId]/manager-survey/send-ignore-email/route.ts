import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendMail, hasSmtpCredentials } from '@/lib/mailer'
import { loadRosterDirectory } from '@/lib/staff-directory'
import { normalizeStaffIdKey } from '@/lib/staff-id'

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

const FONT = 'font-family:Tahoma,Geneva,sans-serif;font-size:12px;'
const P = (html: string) => `<p style="margin:0 0 14px 0;line-height:1.5;${FONT}">${html}</p>`

function buildIgnoreEmail(managerName: string): { subject: string; html: string } {
  const firstName = firstNameOf(managerName)
  const subject = "Please Disregard: 2027 PDP: Your Team's Development Plans"
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${P(`Dear ${firstName},`)}
      ${P(`Please disregard the earlier email titled <strong>"2027 PDP: Your Team's Development Plans"</strong>. It was sent in error during internal testing and requires no action from you. The link in that email has now been disabled.`)}
      ${P("Full details on the 2027 Personal Development Plan process, including when and how you'll be asked to complete it for your team, will be communicated separately in due course.")}
      ${P('We apologise for the inconvenience.')}
      ${P('Best Regards,<br/>Meristem Learning &amp; Development Team')}
    </div>
  `
  return { subject, html }
}

// Sends the "please disregard" notice to every manager who actually received the Track B launch
// email for this cycle, filtered against the CURRENT roster (not the roster at send time) — a
// manager who's since been marked exited/inactive is skipped, here and for any future PDP send,
// same as every other PDP launch already does. Explicitly no CC (not even the platform default)
// since this is a correction notice, not a campaign email.
export async function POST(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  if (!(await hasSmtpCredentials())) return NextResponse.json({ error: 'SMTP is not configured.' }, { status: 400 })

  const surveys = await prisma.pDPManagerSurvey.findMany({ where: { cycleId, sentAt: { not: null }, email: { not: null } } })
  const directory = await loadRosterDirectory()

  const sent: string[] = []
  const skipped: { name: string; reason: string }[] = []

  for (const s of surveys) {
    const current = directory.get(normalizeStaffIdKey(s.managerStaffId))
    if (!current || !current.active) {
      skipped.push({ name: s.managerName, reason: 'No longer active on the roster.' })
      continue
    }
    const { subject, html } = buildIgnoreEmail(s.managerName)
    try {
      await sendMail({ to: s.email!, subject, html, skipDefaultCc: true })
      sent.push(s.managerName)
    } catch (err) {
      skipped.push({ name: s.managerName, reason: err instanceof Error ? err.message : 'Send failed.' })
    }
  }

  return NextResponse.json({ sent: sent.length, skipped })
}
