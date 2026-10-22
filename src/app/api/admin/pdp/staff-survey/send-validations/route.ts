import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { sendPDPManagerValidation } from '@/lib/pdp-send'

interface Body { ids: string[] }

// Admin-triggered "Send/Resend Manager Validation Emails" for selected (or all pending) submitted
// Track A plans — covers two real gaps the auto-trigger-on-submit can miss: a staff member who
// submitted while requireManagerValidation was off for their launch batch, and a validation row
// that was created but never actually sent (a prior attempt failed). sendPDPManagerValidation
// itself now retries any unsent row rather than skipping it, so calling this again for the same
// staffSurveyId is always safe.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = (await req.json().catch(() => ({}))) as Partial<Body>
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'No rows selected.' }, { status: 400 })

  const surveys = await prisma.pDPStaffSurvey.findMany({ where: { id: { in: ids }, respondedAt: { not: null } } })
  let sent = 0
  const skipped: { name: string; reason: string }[] = []
  for (const s of surveys) {
    const result = await sendPDPManagerValidation(s.id)
    sent += result.sent
    skipped.push(...result.skipped)
  }
  const notSubmitted = ids.length - surveys.length
  if (notSubmitted > 0) skipped.push({ name: `${notSubmitted} selected`, reason: "Hasn't submitted their own plan yet — nothing to validate." })

  return NextResponse.json({ sent, skipped })
}
