import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Bulk kill-switch for Track B on this cycle — e.g. an accidental "All" audience launch. Only
// touches not-yet-responded rows (leaves anyone who already genuinely completed their team's
// plans untouched) and stops the daily reminder sweep for them too (sendPDPReminders already
// excludes disabled rows).
export async function POST(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const body = await req.json().catch(() => ({}))
  const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : 'This link has been disabled.'

  const result = await prisma.pDPManagerSurvey.updateMany({
    where: { cycleId, respondedAt: null },
    data: { disabled: true, disabledMessage: message },
  })

  return NextResponse.json({ disabled: result.count })
}
