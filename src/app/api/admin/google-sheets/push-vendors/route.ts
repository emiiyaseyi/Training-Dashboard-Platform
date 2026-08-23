import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { pushVendorUpdatesToSheet } from '@/lib/sheets-sync'

// Pushes the platform's current Vendor values for this year's Training Data back into the live
// sheet's Vendor column — for rows where the vendor was fixed on the platform after the row was
// already imported, so the sheet never picked it up.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await pushVendorUpdatesToSheet()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/google-sheets/push-vendors]', err)
    return NextResponse.json({ success: false, updated: 0, notFound: 0, error: 'Push failed unexpectedly.' }, { status: 500 })
  }
}
