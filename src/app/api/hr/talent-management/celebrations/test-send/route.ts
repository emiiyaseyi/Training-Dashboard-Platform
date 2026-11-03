import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { sendTestCelebrationEmail } from '@/lib/tm-celebrations'

export async function POST(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => null)
  const type = body?.type
  const to = typeof body?.to === 'string' ? body.to.trim() : ''
  if (type !== 'birthday' && type !== 'anniversary') {
    return NextResponse.json({ error: 'type must be "birthday" or "anniversary".' }, { status: 400 })
  }
  if (!to) return NextResponse.json({ error: 'Missing recipient email address.' }, { status: 400 })

  try {
    await sendTestCelebrationEmail(type, to)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to send test email.' }, { status: 500 })
  }
}
