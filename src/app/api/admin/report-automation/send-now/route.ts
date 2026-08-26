import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { sendBUReports } from '@/lib/bu-report-send'

// Manual trigger for admins to test/force a send — bypasses the enabled/sendDay gate the cron
// route checks, since an admin clicking this button is deliberately choosing to send right now.
// Capped at 60s (not the 300s this ideally wants for multiple PDF renders) — a maxDuration value
// beyond what the Vercel plan allows fails the ENTIRE deployment at build time, not just this
// route, which is almost certainly why nothing has shipped since this was set to 300. If reports
// still time out at 60s once confirmed deploying again, that's the real signal to check the plan
// tier and raise this deliberately.
export const maxDuration = 60

export async function POST() {
  const gate = await requirePermission('report-generation', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const summary = await sendBUReports()
    return NextResponse.json(summary)
  } catch (err) {
    console.error('[admin/report-automation/send-now POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to send reports.' }, { status: 500 })
  }
}
