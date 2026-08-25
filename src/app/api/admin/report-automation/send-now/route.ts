import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { sendBUReports } from '@/lib/bu-report-send'

// Manual trigger for admins to test/force a send — bypasses the enabled/sendDay gate the cron
// route checks, since an admin clicking this button is deliberately choosing to send right now.
export const maxDuration = 300

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
