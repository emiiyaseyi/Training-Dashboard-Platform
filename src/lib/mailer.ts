import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/lib/secret-crypto'

// SMTP is configured by the admin in-app (Admin Settings), not environment variables — it's a
// platform-wide capability (surveys today, potentially other notifications later), and admins
// need to be able to change/test it without a redeploy.

export async function hasSmtpCredentials(): Promise<boolean> {
  const s = await prisma.smtpSettings.findFirst()
  return !!(s?.host && s?.port && s?.username && s?.password)
}

async function getTransportAndSettings() {
  const s = await prisma.smtpSettings.findFirst()
  if (!s?.host || !s?.port || !s?.username || !s?.password) {
    throw new Error('SMTP is not configured yet. Set it up in Admin Settings.')
  }
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.username, pass: decryptSecret(s.password) },
  })
  return { transport, settings: s }
}

export interface SendMailInput {
  to: string
  cc?: string[]
  subject: string
  html: string
  fromName?: string
}

// Splits an admin-typed "a@x.com, b@y.com; c@z.com" field into a clean address list — the one
// shared parser for every Cc field this file (or a caller) accepts, so a stray comma/semicolon/
// blank entry never becomes a malformed address handed to nodemailer.
export function parseCcList(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(/[,;]/).map((e) => e.trim()).filter(Boolean)
}

export async function sendMail({ to, cc, subject, html, fromName }: SendMailInput): Promise<void> {
  const { transport, settings } = await getTransportAndSettings()
  const address = settings.fromAddress || settings.username || undefined
  const name = fromName || settings.fromName
  const from = name && address ? `"${name}" <${address}>` : address
  // Applied here, not at each call site — this is the one choke point every email the platform
  // sends passes through (surveys, reminders, custom surveys, cron failure alerts), so this is
  // the only place that can guarantee "every email, no exceptions" without touching every caller.
  const allCc = [...new Set([...(cc || []), ...parseCcList(settings.defaultCc)])]
  await transport.sendMail({
    from,
    to,
    cc: allCc.length > 0 ? allCc.join(', ') : undefined,
    subject,
    html,
  })
}
