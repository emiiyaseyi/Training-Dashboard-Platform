import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Deletes a Track B manager link (and, via cascade, its team-member entries) — for undoing a
// mistaken/duplicate send. Distinct from the emergency "disable" kill-switch: this permanently
// removes the row rather than leaving a disabled link behind, for day-to-day cleanup rather than
// the accidental-mass-launch scenario.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  await prisma.pDPManagerSurvey.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
