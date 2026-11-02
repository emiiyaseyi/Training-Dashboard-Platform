import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { sendNewHireExperienceSurveyNow } from '@/lib/new-hire-survey'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const result = await sendNewHireExperienceSurveyNow(id)
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 })
  return NextResponse.json({ ok: true })
}
