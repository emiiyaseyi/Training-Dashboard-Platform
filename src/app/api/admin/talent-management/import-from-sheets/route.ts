import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { importTMDataFromSheets } from '@/lib/tm-sheets-import'

export const maxDuration = 60

// Admin-triggered import from the Talent Management tabs (Talent Members Info, TM Internal
// Mobility, TM Promotion, TM Strategic Teams, TM Performance Appraisal) in the configured L&D
// spreadsheet into their respective database tables. Safe to run more than once — see
// tm-sheets-import.ts for how each sheet is upserted by its natural key.
export async function POST() {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const result = await importTMDataFromSheets()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[admin/talent-management/import-from-sheets]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
