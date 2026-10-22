import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const VALID_KINDS = ['staffSurvey', 'managerValidation', 'managerTeam']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ cycleId: string; kind: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId, kind } = await params
  if (!VALID_KINDS.includes(kind)) return NextResponse.json({ error: 'Invalid email kind.' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const subject = String(body.subject || '').trim()
  const emailBody = String(body.body || '').trim()
  const buttonLabel = String(body.buttonLabel || '').trim()
  if (!subject || !emailBody || !buttonLabel) return NextResponse.json({ error: 'Subject, body, and button label are all required.' }, { status: 400 })

  const row = await prisma.pDPEmailTemplate.upsert({
    where: { cycleId_kind: { cycleId, kind } },
    create: { cycleId, kind, subject, body: emailBody, buttonLabel, showFallbackLink: !!body.showFallbackLink },
    update: { subject, body: emailBody, buttonLabel, showFallbackLink: !!body.showFallbackLink },
  })
  return NextResponse.json(row)
}

// Resets this template back to the built-in default by deleting the customization row.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ cycleId: string; kind: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId, kind } = await params
  await prisma.pDPEmailTemplate.deleteMany({ where: { cycleId, kind } })
  return NextResponse.json({ success: true })
}
