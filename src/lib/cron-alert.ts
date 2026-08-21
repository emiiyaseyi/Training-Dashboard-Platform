import { prisma } from '@/lib/prisma'
import { sendMail, hasSmtpCredentials } from '@/lib/mailer'

// Cron runs are unattended — a failure otherwise only shows up in Vercel's function logs, which
// nobody is watching day to day. Best-effort: if SMTP isn't configured, or the alert email itself
// fails to send, this silently no-ops rather than throwing — a notification failure must never
// turn into a 500 on the cron route itself (the cron's own outcome is already returned as JSON).
export async function sendCronFailureAlert(jobName: string, errors: string[]): Promise<void> {
  if (errors.length === 0) return
  try {
    if (!(await hasSmtpCredentials())) return
    const superAdmins = await prisma.user.findMany({ where: { isSuperAdmin: true, isActive: true }, select: { email: true } })
    const to = superAdmins.map((u) => u.email).filter((e): e is string => !!e)
    if (to.length === 0) return

    const list = errors.slice(0, 20).map((e) => `<li style="margin:0 0 6px 0;">${e}</li>`).join('')
    const more = errors.length > 20 ? `<p style="margin:8px 0 0 0;color:#6b7280;">+ ${errors.length - 20} more.</p>` : ''
    const html = `
      <div style="font-family:Tahoma,Geneva,sans-serif;font-size:12px;color:#1E2761;">
        <p style="margin:0 0 14px 0;line-height:1.5;">The <strong>${jobName}</strong> scheduled job hit ${errors.length} error${errors.length === 1 ? '' : 's'} on its most recent run:</p>
        <ul style="margin:0 0 14px 0;padding-left:20px;line-height:1.5;">${list}</ul>
        ${more}
        <p style="margin:0;line-height:1.5;color:#6b7280;">This is an automated alert — check Admin Settings for details.</p>
      </div>`

    await sendMail({ to: to[0], cc: to.slice(1), subject: `[Alert] ${jobName} failed`, html })
  } catch (err) {
    console.error('[cron-alert] failed to send failure notification', err)
  }
}
