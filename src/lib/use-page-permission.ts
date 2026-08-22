'use client'

import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { hasAccess, pageKeyForPath, type PermissionLevel } from '@/lib/permissions'

// Client-side mirror of the server-side permission check for the page currently being viewed —
// used to hide controls (export, admin-only diagnostics) a user can see the button for but whose
// underlying action would 403 anyway. The server route is still the real gate; this is just so
// the UI doesn't offer something that isn't actually available.
export function usePagePermission() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const pageKey = pageKeyForPath(pathname)
  const isSuperAdmin = !!session?.user?.isSuperAdmin
  const level = pageKey ? session?.user?.permissions?.[pageKey] : undefined

  const can = (required: PermissionLevel) => isSuperAdmin || hasAccess(level, required)

  return {
    pageKey,
    isSuperAdmin,
    canExport: can('view-export'),
    canAdmin: can('admin'),
    // Platform-admin, independent of which page is being viewed — for operational diagnostics
    // (data quality scores, sync/reconciliation controls) that aren't really "this page's data"
    // so much as "something only whoever manages the data source should see."
    isPlatformAdmin: isSuperAdmin || hasAccess(session?.user?.permissions?.['admin-settings'], 'admin'),
  }
}
