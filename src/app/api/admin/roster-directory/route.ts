import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory } from '@/lib/staff-directory'

// Full confirmed-staff directory for client-side search when picking training attendees —
// small enough (a few hundred rows) to fetch once and filter in the browser rather than
// round-tripping a search API on every keystroke.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const directory = await loadRosterDirectory()
  return NextResponse.json([...directory.values()])
}
