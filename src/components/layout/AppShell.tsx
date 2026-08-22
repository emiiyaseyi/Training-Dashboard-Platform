'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ShieldAlert, Menu, BookOpen } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { IdleLogout } from '@/components/auth/IdleLogout'
import { hasAccess, pageKeyForPath, PAGE_LABELS } from '@/lib/permissions'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const isLoginPage = pathname === '/login'
  // Public, token-secured survey forms — no platform account exists for the respondent, so this
  // must never redirect to login (mirrors middleware.ts's matcher, which already skips auth for
  // these paths server-side; this is the client-side equivalent for AppShell's own session check).
  const isPublicPage = isLoginPage || pathname.startsWith('/survey/')

  // Defense in depth: middleware normally redirects unauthenticated requests to /login before
  // this ever renders, but a stale/undecryptable session cookie (e.g. left over from before
  // AUTH_SECRET was set) can leave the client stuck "logged out" without a server redirect.
  // Push to /login ourselves rather than rendering a permanently empty page.
  useEffect(() => {
    if (!isPublicPage && status === 'unauthenticated') {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname)}`)
    }
  }, [status, isPublicPage, pathname, router])

  // Close the mobile drawer whenever the route changes — otherwise navigating via a link left it
  // open over the new page (links also call onClose directly, but this covers back/forward nav).
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

  if (isPublicPage) {
    return <main className="w-full min-h-screen overflow-y-auto">{children}</main>
  }

  if (status === 'loading' || status === 'unauthenticated' || !session?.user) {
    return (
      <>
        <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <main className="flex-1 overflow-y-auto flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
        </main>
      </>
    )
  }

  const pageKey = pageKeyForPath(pathname)
  const allowed = session.user.isSuperAdmin || !pageKey || hasAccess(session.user.permissions?.[pageKey], 'view')

  return (
    <>
      <IdleLogout />
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile-only top bar — the sidebar itself is off-canvas below md, this is how it's reopened */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shrink-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            className="p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BookOpen className="w-4 h-4 text-navy-700 shrink-0" />
          <span className="text-sm font-semibold text-slate-800 truncate">Learning Intel</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          {allowed ? (
            children
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <ShieldAlert className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-slate-700 font-medium">Access restricted</p>
              <p className="text-slate-500 text-sm mt-1 max-w-sm">
                You don&apos;t have permission to view {pageKey ? PAGE_LABELS[pageKey] : 'this page'}. Contact your
                administrator if you need access.
              </p>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
