import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { getCelebrationSettings, saveCelebrationSettings } from '@/lib/tm-celebrations'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const settings = await getCelebrationSettings()
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => null)
  if (
    typeof body?.senderName !== 'string' ||
    typeof body?.birthdaySubject !== 'string' ||
    typeof body?.birthdayBody !== 'string' ||
    typeof body?.anniversarySubject !== 'string' ||
    typeof body?.anniversaryBody !== 'string'
  ) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const updated = await saveCelebrationSettings({
    senderName: body.senderName.trim() || 'Human Resources',
    fromAddress: typeof body.fromAddress === 'string' ? body.fromAddress.trim() || null : null,
    ccEmails: typeof body.ccEmails === 'string' ? body.ccEmails.trim() || null : null,
    birthdaySubject: body.birthdaySubject,
    birthdayBody: body.birthdayBody,
    anniversarySubject: body.anniversarySubject,
    anniversaryBody: body.anniversaryBody,
  })
  return NextResponse.json(updated)
}
