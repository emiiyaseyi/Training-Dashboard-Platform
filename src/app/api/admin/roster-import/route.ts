import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { previewRosterImport, applyRosterImport, defaultRosterTab } from '@/lib/roster-import'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate
  return NextResponse.json({ tab: await defaultRosterTab() })
}

// mode "preview" reads and compares only; "apply" writes (updates in place, adds new people).
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate
  try {
    const { mode, tab, deactivateMissing } = (await req.json()) as { mode?: 'preview' | 'apply'; tab?: string; deactivateMissing?: boolean }
    if (mode === 'apply') return NextResponse.json(await applyRosterImport(tab, !!deactivateMissing))
    return NextResponse.json(await previewRosterImport(tab))
  } catch (err) {
    console.error('[admin/roster-import POST]', err)
    return NextResponse.json({ error: 'Roster import failed.' }, { status: 500 })
  }
}
