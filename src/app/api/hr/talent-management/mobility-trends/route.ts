import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { computeTMMobilityTrends } from '@/lib/talent-management-trends'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    return NextResponse.json(await computeTMMobilityTrends())
  } catch (err) {
    console.error('[hr/talent-management/mobility-trends GET]', err)
    return NextResponse.json({ error: 'Failed to compute mobility trends.' }, { status: 500 })
  }
}
