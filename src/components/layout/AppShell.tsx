'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ShieldAlert } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { hasAccess, pageKeyForPath, PAGE_LABELS } from '@/lib/permissions'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
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

  if (isPublicPage) {
    return <main className="w-full min-h-screen overflow-y-auto">{children}</main>
  }

  if (status === 'loading' || status === 'unauthenticated' || !session?.user) {
    return (
      <>
        <Sidebar />
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
      <Sidebar />
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
    </>
  )
}
