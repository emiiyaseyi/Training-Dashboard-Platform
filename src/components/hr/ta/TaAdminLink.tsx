'use client'

import Link from 'next/link'
import { Settings } from 'lucide-react'
import { usePagePermission } from '@/lib/use-page-permission'

// Mirrors the "TM Admin" button on the Talent Management landing page, pointing at the
// TA-specific admin sub-route (/hr/talent-acquisition/admin) — same canAdmin gating as every
// other HR unit's admin button, not isSuperAdmin only.
export function TaAdminLink() {
  const { canAdmin } = usePagePermission()
  if (!canAdmin) return null

  return (
    <Link
      href="/hr/talent-acquisition/admin"
      className="flex items-center gap-1.5 text-xs font-medium text-meristem-700 bg-meristem-50 hover:bg-meristem-100 rounded-lg px-3 py-2"
    >
      <Settings className="w-3.5 h-3.5" /> TA Admin
    </Link>
  )
}
