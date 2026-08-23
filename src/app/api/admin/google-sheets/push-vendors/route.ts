import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { pushVendorUpdatesToSheet } from '@/lib/sheets-sync'

// Pushes the platform's current Vendor values for one year's Training Data back into the live
// sheet's Vendor column — for rows where the vendor was fixed on the platform after the row was
// already imported, so the sheet never picked it up. Defaults to the current year if none is
// given, but accepts any year so a fix made on a prior year's record can be pushed too.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json().catch(() => ({}))
    const year = typeof body?.year === 'number' && Number.isFinite(body.year) ? body.year : undefined
    const result = await pushVendorUpdatesToSheet(year)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/google-sheets/push-vendors]', err)
    return NextResponse.json({ success: false, updated: 0, notFound: 0, error: 'Push failed unexpectedly.' }, { status: 500 })
  }
}
