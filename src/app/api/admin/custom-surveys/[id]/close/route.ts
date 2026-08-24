import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Stops the daily reminder sweep for this survey (the form itself stays reachable for anyone who
// still has the link — closing only means "no more nudges", not "no more responses accepted").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const survey = await prisma.customSurvey.findUnique({ where: { id } })
  if (!survey) return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
  if (survey.status !== 'launched') {
    return NextResponse.json({ error: 'Only a launched survey can be closed.' }, { status: 400 })
  }

  const updated = await prisma.customSurvey.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } })
  return NextResponse.json(updated)
}
