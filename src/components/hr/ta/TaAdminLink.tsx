'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Settings } from 'lucide-react'

// Mirrors the "TM Admin" button on the Talent Management landing page, pointing at the
// TA-specific admin sub-route (/hr/talent-acquisition/admin) rather than the shared, cross-unit
// /hr/admin settings page. That TA admin page is gated on isSuperAdmin directly (see its own
// comment) rather than the generic HR permission system — so this checks isSuperAdmin, not
// canAdmin, to avoid showing a button that 403s for a unit-level HR admin.
export function TaAdminLink() {
  const { data: session } = useSession()
  if (!session?.user?.isSuperAdmin) return null

  return (
    <Link
      href="/hr/talent-acquisition/admin"
      className="flex items-center gap-1.5 text-xs font-medium text-meristem-700 bg-meristem-50 hover:bg-meristem-100 rounded-lg px-3 py-2"
    >
      <Settings className="w-3.5 h-3.5" /> TA Admin
    </Link>
  )
}
