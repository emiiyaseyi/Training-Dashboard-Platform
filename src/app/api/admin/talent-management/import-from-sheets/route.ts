import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { importOneTMSheet, TM_SHEET_KEYS, type TMSheetKey } from '@/lib/tm-sheets-import'

export const maxDuration = 60

// Admin-triggered import from one Talent Management tab (Talent Members Info, TM Internal
// Mobility, TM Promotion, TM Strategic Teams, or TM Performance Appraisal) into its database
// table. Deliberately one sheet per request — the admin page calls this 5 times, once per sheet,
// instead of one request doing all 5: even with DB writes bounded to the connection pool, all 5
// sheets back-to-back in a single request still didn't reliably fit Vercel's 60s limit. Safe to
// run more than once — see tm-sheets-import.ts for how each sheet is upserted by its natural key.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json().catch(() => ({}))
    const sheet = body.sheet as TMSheetKey | undefined
    if (!sheet || !TM_SHEET_KEYS.includes(sheet)) {
      return NextResponse.json({ error: `"sheet" must be one of: ${TM_SHEET_KEYS.join(', ')}` }, { status: 400 })
    }
    const result = await importOneTMSheet(sheet)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[admin/talent-management/import-from-sheets]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
