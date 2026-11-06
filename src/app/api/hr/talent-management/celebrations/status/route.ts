import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { getUpcomingCelebrations, getRecentCelebrationSendLog, getRecentSweepRuns } from '@/lib/tm-celebrations'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const [upcoming, sendLog, sweepRuns] = await Promise.all([
    getUpcomingCelebrations(5),
    getRecentCelebrationSendLog(20),
    getRecentSweepRuns(5),
  ])

  return NextResponse.json({ upcoming, sendLog, sweepRuns })
}
