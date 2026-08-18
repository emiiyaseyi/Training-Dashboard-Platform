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

  useEffect(() => {
    if (session?.user?.mustChangePassword && pathname !== '/account' && pathname !== '/login') {
      router.push('/account')
    }
  }, [session, pathname, router])

  if (isLoginPage) {
    return <main className="w-full min-h-screen overflow-y-auto">{children}</main>
  }

  if (status === 'loading' || !session?.user) {
    return (
      <>
        <Sidebar />
        <main className="flex-1 overflow-y-auto" />
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
