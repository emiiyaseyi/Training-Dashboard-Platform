import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendBUReports } from '@/lib/bu-report-send'
import { sendCronFailureAlert } from '@/lib/cron-alert'

// Rendering a PDF via headless Chromium (and a PPTX) per Business Unit is far heavier than the
// other cron jobs — generous headroom vs. the platform's other routes. NOTE: unverified against
// this project's actual Vercel plan tier; if reports start timing out in production logs, this
// (or the plan's function duration limit) is the first thing to check.
export const maxDuration = 300

// Runs daily (see vercel.json) but only actually sends on the admin-configured day of month —
// same "daily cron, gated by a stored setting" shape as send-surveys.ts, so a missed run (Vercel
// hiccup, etc.) isn't silently skipped forever: it just tries again tomorrow, still gated by the
// day check, rather than a once-a-month cron schedule that has no retry if it fails outright.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }
  }

  const settings = await prisma.reportAutomationSettings.findFirst()
  if (!settings?.enabled) {
    return NextResponse.json({ success: true, skipped: 'Report automation is disabled.' })
  }

  const today = new Date().getDate()
  if (today !== settings.sendDay) {
    return NextResponse.json({ success: true, skipped: `Not send day (configured: ${settings.sendDay}, today: ${today}).` })
  }

  try {
    const summary = await sendBUReports()
    await sendCronFailureAlert(
      'BU report send',
      summary.errors.map((e) => `${e.businessUnit}${e.recipient ? ` (${e.recipient})` : ''}: ${e.message}`)
    )
    return NextResponse.json({ success: summary.failed === 0, ...summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'BU report send failed unexpectedly.'
    await sendCronFailureAlert('BU report send', [message])
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
