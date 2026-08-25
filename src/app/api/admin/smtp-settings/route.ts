import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { encryptSecret } from '@/lib/secret-crypto'

// The password is intentionally never included in the response — only whether one is set.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const s = await prisma.smtpSettings.findFirst({ orderBy: { updatedAt: 'desc' } })
  return NextResponse.json({
    host: s?.host || '',
    port: s?.port || '',
    username: s?.username || '',
    passwordSet: !!s?.password,
    fromName: s?.fromName || 'Meristem L&D',
    fromAddress: s?.fromAddress || '',
    defaultCc: s?.defaultCc || '',
    configured: !!(s?.host && s?.port && s?.username && s?.password),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const existing = await prisma.smtpSettings.findFirst({ orderBy: { updatedAt: 'desc' } })

    const data: Record<string, unknown> = {
      host: body.host || null,
      port: body.port ? parseInt(body.port, 10) : null,
      username: body.username || null,
      fromName: body.fromName || 'Meristem L&D',
      fromAddress: body.fromAddress || null,
      defaultCc: body.defaultCc?.trim() || null,
    }
    // Only overwrite the stored password if a new one was actually typed — leaving the field
    // blank in the form means "keep the existing one", not "clear it". Encrypted at rest —
    // mailer.ts's decryptSecret() reverses this (and tolerates old plaintext rows) when sending.
    if (body.password) data.password = encryptSecret(body.password)

    const updated = existing
      ? await prisma.smtpSettings.update({ where: { id: existing.id }, data })
      : await prisma.smtpSettings.create({ data })

    return NextResponse.json({ success: true, configured: !!(updated.host && updated.port && updated.username && updated.password) })
  } catch (err) {
    console.error('[admin/smtp-settings POST]', err)
    return NextResponse.json({ error: 'Failed to save SMTP settings.' }, { status: 500 })
  }
}
