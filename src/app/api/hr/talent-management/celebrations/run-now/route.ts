import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { sendDueTMCelebrationEmails } from '@/lib/tm-celebrations'

// Manual "run the daily sweep right now" trigger — same function the cron calls, so it's exactly
// as idempotent (TMCelebrationSendLog's unique constraint still blocks a double-send for anyone
// already mailed this year) and logs a TMCelebrationSweepRun row the same way. For catching up a
// birthday/anniversary the ~8am automated run missed or hasn't reached yet.
export async function POST() {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await sendDueTMCelebrationEmails()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to run the Celebrations sweep.' }, { status: 500 })
  }
}
