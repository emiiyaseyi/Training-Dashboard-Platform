import nodemailer from 'nodemailer'

export function hasSmtpCredentials(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'SMTP is not configured on the server. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in environment variables, then redeploy.'
    )
  }
  const port = parseInt(SMTP_PORT, 10)
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

export interface SendMailInput {
  to: string
  cc?: string[]
  subject: string
  html: string
  fromName?: string
}

export async function sendMail({ to, cc, subject, html, fromName }: SendMailInput): Promise<void> {
  const transport = getTransport()
  const address = process.env.SMTP_FROM || process.env.SMTP_USER
  const from = fromName ? `"${fromName}" <${address}>` : address
  await transport.sendMail({
    from,
    to,
    cc: cc && cc.length > 0 ? cc.join(', ') : undefined,
    subject,
    html,
  })
}
