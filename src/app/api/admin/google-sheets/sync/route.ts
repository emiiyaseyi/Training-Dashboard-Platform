import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { syncFromGoogleSheets } from '@/lib/sheets-sync'

// Manual "Sync Now" trigger — same underlying sync logic the scheduled cron job uses.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await syncFromGoogleSheets()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/google-sheets/sync]', err)
    return NextResponse.json({ error: 'Sync failed unexpectedly.' }, { status: 500 })
  }
}
