'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ShieldAlert, Menu } from 'lucide-react'
import { HrSidebar } from '@/components/hr/HrSidebar'
import { hasAccess, pageKeyForPath, PAGE_LABELS, HR_UNIT_KEYS } from '@/lib/permissions'

// Mirrors AppShell's page-key gate (src/components/layout/AppShell.tsx), restyled for HR and
// scoped to /hr routes only — AppShell hands off to this layout entirely for that section (see
// its isHrSection branch) rather than wrapping HR pages in the Learning Intelligence Sidebar.
// By the time this renders, AppShell has already confirmed the session is authenticated.
export default function HrLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (!session?.user) return null

  const pageKey = pageKeyForPath(pathname)
  // The Summary page has its own permission, but anyone who can see at least one unit can also
  // see the rollup that links to it — same fallback HrSidebar already applies to its own
  // "Summary" nav link, kept in sync with it here so the link it renders is never a dead end.
  const canSeeSummaryViaAnyUnit = pageKey === 'hr-summary' && HR_UNIT_KEYS.some((k) => hasAccess(session.user.permissions?.[k], 'view'))
  const allowed = session.user.isSuperAdmin || !pageKey || hasAccess(session.user.permissions?.[pageKey], 'view') || canSeeSummaryViaAnyUnit

  return (
    <div className="flex-1 flex h-screen overflow-hidden bg-meristem-50">
      <HrSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-meristem-100 bg-white shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-meristem-50"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-serif text-sm font-bold text-meristem-800 truncate">MERISTEM HR</span>
        </div>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {allowed ? (
            children
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <ShieldAlert className="w-10 h-10 text-meristem-200 mb-3" />
              <p className="text-slate-700 font-medium">Access restricted</p>
              <p className="text-slate-500 text-sm mt-1 max-w-sm">
                You don&apos;t have permission to view {pageKey ? PAGE_LABELS[pageKey] : 'this page'}. Contact your
                administrator if you need access.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
