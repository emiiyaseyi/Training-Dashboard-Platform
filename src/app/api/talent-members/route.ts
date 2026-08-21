import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { computeTalentMemberReport } from '@/lib/talent-member'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('talent-members', 'view')
  if (gate instanceof NextResponse) return gate

  const year = parseInt(req.nextUrl.searchParams.get('year') || '') || new Date().getFullYear()
  try {
    const report = await computeTalentMemberReport(year)
    return NextResponse.json(report)
  } catch (err) {
    console.error('[talent-members GET]', err)
    return NextResponse.json({ error: 'Failed to compute Talent Members report.' }, { status: 500 })
  }
}
