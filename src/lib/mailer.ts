import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { decryptSecret, encryptSecret, isEncryptedSecret } from '@/lib/secret-crypto'

// SMTP is configured by the admin in-app (Admin Settings), not environment variables — it's a
// platform-wide capability (surveys today, potentially other notifications later), and admins
// need to be able to change/test it without a redeploy.

export async function hasSmtpCredentials(): Promise<boolean> {
  const s = await prisma.smtpSettings.findFirst({ orderBy: { updatedAt: 'desc' } })
  return !!(s?.host && s?.port && s?.username && s?.password)
}

async function getTransportAndSettings() {
  // SmtpSettings has no unique constraint enforcing "only ever one row" — if a race on the very
  // first save (two requests both finding no existing row) ever created two, an unordered
  // findFirst() can silently return whichever one Postgres happens to hand back first, which may
  // not be the row the admin actually last edited in the panel. Ordering by updatedAt makes the
  // most-recently-saved row win, deterministically, every time.
  const rows = await prisma.smtpSettings.findMany({ orderBy: { updatedAt: 'desc' } })
  const s = rows[0]
  if (rows.length > 1) {
    await prisma.smtpSettings.deleteMany({ where: { id: { in: rows.slice(1).map((r) => r.id) } } })
  }
  if (!s?.host || !s?.port || !s?.username || !s?.password) {
    throw new Error('SMTP is not configured yet. Set it up in Admin Settings.')
  }
  // Self-healing migration: a password saved before the admin-settings save path encrypted it
  // (or one restored/copied in some other way) sits in the DB as plaintext. decryptSecret()
  // already tolerates that on read, but the very next real chance to fix it at rest is right
  // here — re-encrypt and persist it before it's ever used, so it doesn't stay exposed.
  let storedPassword = s.password
  if (!isEncryptedSecret(storedPassword)) {
    storedPassword = encryptSecret(storedPassword)
    await prisma.smtpSettings.update({ where: { id: s.id }, data: { password: storedPassword } })
  }
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.username, pass: decryptSecret(storedPassword) },
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
