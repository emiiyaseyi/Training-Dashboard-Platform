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
    storedPassword = encryptSecret(storedPassword.trim())
    await prisma.smtpSettings.update({ where: { id: s.id }, data: { password: storedPassword } })
  } else {
    // Same self-heal for a value that WAS already encrypted, but from before the save route
    // trimmed input — a stray leading/trailing space or newline (a very common copy-paste
    // artifact) gets stored and sent byte-for-byte, while most other mail clients silently trim
    // credential fields before authenticating. That mismatch is exactly what makes an
    // otherwise-correct password fail here and nowhere else. Re-persisted only when trimming
    // actually changes something, so this is a no-op once already clean.
    const decrypted = decryptSecret(storedPassword)
    const trimmed = decrypted.trim()
    if (trimmed !== decrypted) {
      storedPassword = encryptSecret(trimmed)
      await prisma.smtpSettings.update({ where: { id: s.id }, data: { password: storedPassword } })
    }
  }
  // Pooled so a caller sending several emails off ONE resolved transport (see createMailSender
  // below) reuses live SMTP connections across them instead of a fresh TLS handshake + auth per
  // email — that per-email handshake cost, multiplied across a schedule's whole attendee list
  // sent fully sequentially, is what made a "resend to all" on a schedule with more than a
  // handful of people slow enough to look hung (and risk the request outliving the route's
  // timeout with no error ever reaching the client).
  // Explicit timeouts so ONE bad recipient (a manager email pointing at a dead/unreachable
  // domain, a mail server that never sends its greeting, etc.) fails fast with a real error
  // instead of hanging — without these, nodemailer has no timeout of its own on some of these
  // stages, so a single stuck connection can sit open indefinitely, which from the admin's screen
  // looks exactly like "keeps loading and never sends," with no error ever surfacing.
  // maxConnections is 1, not several: many company mail servers cap concurrent authenticated
  // SMTP sessions per account (often to exactly one), silently rejecting the 2nd+ simultaneous
  // login with what looks like a bad-credential error even though the password is fine — this is
  // what "first send in a batch works, the next one moments later fails" turned out to be. Pooling
  // stays on so a multi-email send still reuses one live connection instead of a fresh TLS+auth
  // handshake per email; only true concurrency (several connections open at once) is removed.
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.username.trim(), pass: decryptSecret(storedPassword) },
    pool: true,
    maxConnections: 1,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  })
  return { transport, settings: s }
}

export interface SendMailInput {
  to: string
  cc?: string[]
  subject: string
  html: string
  fromName?: string
  attachments?: { filename: string; content: Buffer }[]
  // Skips merging in SmtpSettings.defaultCc for this one send — used by the reminder sweep (see
  // SurveySettings.excludeDefaultCcOnReminders) so a daily nudge doesn't keep copying the
  // platform-wide default Cc list every single day. Every other caller leaves this unset, so
  // "every email, no exceptions" still holds everywhere else.
  skipDefaultCc?: boolean
}

// Splits an admin-typed "a@x.com, b@y.com; c@z.com" field into a clean address list — the one
// shared parser for every Cc field this file (or a caller) accepts, so a stray comma/semicolon/
// blank entry never becomes a malformed address handed to nodemailer.
export function parseCcList(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(/[,;]/).map((e) => e.trim()).filter(Boolean)
}

function buildMessage(settings: { fromAddress: string | null; fromName: string; defaultCc: string | null; username: string | null }, input: SendMailInput) {
  const address = settings.fromAddress || settings.username || undefined
  const name = input.fromName || settings.fromName
  const from = name && address ? `"${name}" <${address}>` : address
  // Applied here, not at each call site — this is the one choke point every email the platform
  // sends passes through (surveys, reminders, custom surveys, cron failure alerts), so this is
  // the only place that can guarantee "every email, no exceptions" without touching every caller.
  const allCc = [...new Set([...(input.cc || []), ...(input.skipDefaultCc ? [] : parseCcList(settings.defaultCc))])]
  return {
    from,
    to: input.to,
    cc: allCc.length > 0 ? allCc.join(', ') : undefined,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  }
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const { transport, settings } = await getTransportAndSettings()
  try {
    await transport.sendMail(buildMessage(settings, input))
  } finally {
    transport.close()
  }
}

// For sending several emails in one call (a schedule's whole attendee list, a reminder sweep) —
// resolves settings and builds the pooled transport ONCE, reused for every send instead of paying
// a fresh connection + TLS handshake + auth per email. Caller MUST call close() when done (a
// try/finally around the loop), or the pooled connections stay open until they idle out on their
// own.
export async function createMailSender(): Promise<{ send: (input: SendMailInput) => Promise<void>; close: () => void }> {
  const { transport, settings } = await getTransportAndSettings()
  return {
    send: (input) => transport.sendMail(buildMessage(settings, input)).then(() => undefined),
    close: () => transport.close(),
  }
}
