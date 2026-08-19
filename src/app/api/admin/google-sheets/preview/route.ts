import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { previewGoogleSheetsSync } from '@/lib/sheets-sync'

// Read-only — shows what a sync would import without writing anything to the database.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await previewGoogleSheetsSync()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/google-sheets/preview]', err)
    return NextResponse.json({ error: 'Preview failed unexpectedly.' }, { status: 500 })
  }
}
