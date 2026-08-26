import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasAccess, parseBUScope, type PageKey, type PermissionLevel } from '@/lib/permissions'
import { logAudit } from '@/lib/audit-log'

// Server-side guard for API routes. Returns the session if the caller is authenticated
// and (for super admins, always; otherwise) holds at least `required` on `page`.
// Otherwise returns a ready-to-return NextResponse — call sites do:
//   const gate = await requirePermission('upload-data', 'admin')
//   if (gate instanceof NextResponse) return gate
//   const session = gate
//
// Every admin-level check (by convention, requested only for a mutating write, never a plain
// GET) is logged — granted or denied — as one "admin_action" audit entry per call, keyed by
// `page` (e.g. "upload-data"). This piggybacks on the one gate nearly every admin route already
// calls, giving broad audit coverage of "who changed what area, and when" without touching each
// route individually. 'view'-level checks are read-only lookups and far too frequent to be
// "meaningful actions," so they're deliberately not logged here.
export async function requirePermission(page: PageKey, required: PermissionLevel) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 })
  }
  if (session.user.isSuperAdmin) {
    // Awaited, not fire-and-forget — a serverless function can freeze right after the response is
    // sent, which would silently drop an un-awaited background write more often than on a
    // long-running server.
    if (required === 'admin') await logAudit({ userId: session.user.id, userName: session.user.name, userEmail: session.user.email, action: 'admin_action', detail: page })
    return session
  }
  if (!hasAccess(session.user.permissions?.[page], required)) {
    if (required === 'admin') await logAudit({ userId: session.user.id, userName: session.user.name, userEmail: session.user.email, action: 'admin_action', detail: `${page} (denied)` })
    return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 })
  }
  if (required === 'admin') await logAudit({ userId: session.user.id, userName: session.user.name, userEmail: session.user.email, action: 'admin_action', detail: page })
  return session
}

export async function requireSession() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 })
  }
  return session
}

// Business-unit scope filter — null means "no restriction" (ALL scope or super admin),
// otherwise the list of Business Unit names the user is allowed to see.
export function buScopeFilter(session: { user: { isSuperAdmin: boolean; businessUnitScope: string } }): string[] | null {
  if (session.user.isSuperAdmin) return null
  const scope = parseBUScope(session.user.businessUnitScope)
  return scope === 'ALL' ? null : scope
}
