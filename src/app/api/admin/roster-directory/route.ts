import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory } from '@/lib/staff-directory'

// Full confirmed-staff directory for client-side search when picking training attendees —
// small enough (a few hundred rows) to fetch once and filter in the browser rather than
// round-tripping a search API on every keystroke.
// Excludes deactivated staff (Employees page) by default — this endpoint is specifically for
// adding someone to something NEW, unlike loadRosterDirectory() itself, which stays inclusive
// everywhere else since historical records still need to resolve a since-deactivated person's
// name/BU correctly. Pass ?includeInactive=1 for the few callers (e.g. the Talent Member roster,
// where someone who's since exited can still legitimately be added and marked Exited) that need
// to search for a deactivated person too.
export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === '1'
  const directory = await loadRosterDirectory()
  const list = [...directory.values()]
  return NextResponse.json(includeInactive ? list : list.filter((s) => s.active))
}
