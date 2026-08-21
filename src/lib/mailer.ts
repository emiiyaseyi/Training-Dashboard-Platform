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

export async function sendMail({ to, cc, subject, html, fromName }: SendMailInput): Promise<void> {
  const { transport, settings } = await getTransportAndSettings()
  const address = settings.fromAddress || settings.username || undefined
  const name = fromName || settings.fromName
  const from = name && address ? `"${name}" <${address}>` : address
  await transport.sendMail({
    from,
    to,
    cc: cc && cc.length > 0 ? cc.join(', ') : undefined,
    subject,
    html,
  })
}
