import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { previewRosterImport, applyRosterImport, defaultRosterTab, type RosterImportOptions } from '@/lib/roster-import'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate
  return NextResponse.json({ tab: await defaultRosterTab() })
}

// mode "preview" reads and compares only; "apply" writes (updates in place, adds new people).
// exclude / overrides / keepActive are the admin's choices from the preview — see RosterImportOptions.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate
  try {
    const { mode, tab, deactivateMissing, exclude, overrides, keepActive } = (await req.json()) as {
      mode?: 'preview' | 'apply'; tab?: string; deactivateMissing?: boolean
    } & RosterImportOptions
    const opts: RosterImportOptions = { exclude, overrides, keepActive }
    if (mode === 'apply') return NextResponse.json(await applyRosterImport(tab, !!deactivateMissing, opts))
    return NextResponse.json(await previewRosterImport(tab, opts))
  } catch (err) {
    console.error('[admin/roster-import POST]', err)
    return NextResponse.json({ error: 'Roster import failed.' }, { status: 500 })
  }
}
