import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hasAccess, type PageKey, type PermissionLevel } from '@/lib/permissions'

// Server-side guard for API routes. Returns the session if the caller is authenticated
// and (for super admins, always; otherwise) holds at least `required` on `page`.
// Otherwise returns a ready-to-return NextResponse — call sites do:
//   const gate = await requirePermission('upload-data', 'admin')
//   if (gate instanceof NextResponse) return gate
//   const session = gate
export async function requirePermission(page: PageKey, required: PermissionLevel) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 })
  }
  if (session.user.isSuperAdmin) return session
  if (!hasAccess(session.user.permissions?.[page], required)) {
    return NextResponse.json({ error: 'You do not have permission to perform this action.' }, { status: 403 })
  }
  return session
}

export async function requireSession() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 })
  }
  return session
}

// Business-unit scope filter — null means "no restriction" (ALL scope or super admin).
export function buScopeFilter(session: { user: { isSuperAdmin: boolean; businessUnitScope: string } }): string | null {
  if (session.user.isSuperAdmin) return null
  if (session.user.businessUnitScope === 'ALL') return null
  return session.user.businessUnitScope
}
