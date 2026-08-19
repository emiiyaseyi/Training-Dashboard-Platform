import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncFromGoogleSheets } from '@/lib/sheets-sync'

// Invoked by Vercel Cron (see vercel.json) on a fixed heartbeat — actually syncs only when the
// admin has auto-sync enabled AND enough time has passed since the last sync to satisfy their
// chosen frequency. This lets one fixed cron schedule serve the admin's configurable interval.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }
  }

  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.autoSyncEnabled || !config.spreadsheetUrl) {
    return NextResponse.json({ skipped: true, reason: 'Auto-sync not enabled or no spreadsheet configured.' })
  }

  const minutesSinceLastSync = config.lastSyncedAt
    ? (Date.now() - config.lastSyncedAt.getTime()) / 60000
    : Infinity
  if (minutesSinceLastSync < config.syncFrequencyMinutes) {
    return NextResponse.json({ skipped: true, reason: `Next sync due in ${Math.ceil(config.syncFrequencyMinutes - minutesSinceLastSync)} min.` })
  }

  try {
    const result = await syncFromGoogleSheets('scheduled')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron/sync-sheets]', err)
    return NextResponse.json({ error: 'Scheduled sync failed unexpectedly.' }, { status: 500 })
  }
}
