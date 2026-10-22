import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Same mechanism as the training-schedule attendee stop-reminders route: sets respondedAt, which
// is the one field sendPDPReminders already checks to skip someone — makes this indistinguishable
// from a real response everywhere else that reads it (the tick turns green, same as a real fill).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.pDPStaffSurvey.update({ where: { id }, data: { respondedAt: new Date() } })
  return NextResponse.json(survey)
}
