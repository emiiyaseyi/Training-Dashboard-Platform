import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Deletes a Track A launch row (and, via cascade, its manager validation rows) — for undoing a
// mistaken/duplicate send, same "admin can clean up what was sent" need Survey Automation's
// per-attendee delete covers. The person's answer, if they already submitted, is deleted too;
// this is a deliberate removal, not something to use on anyone whose submitted plan should stay
// on record.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  await prisma.pDPStaffSurvey.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
