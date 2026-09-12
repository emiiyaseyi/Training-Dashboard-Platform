'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  LayoutGrid, Users, UserSearch, GraduationCap, TrendingUp, Wallet, LogOut, X,
} from 'lucide-react'
import { hasAccess, PAGE_LABELS, PAGE_ROUTES, HR_UNIT_KEYS, type PageKey } from '@/lib/permissions'

const UNIT_ICONS: Record<(typeof HR_UNIT_KEYS)[number], typeof Users> = {
  'hr-employee-services': Users,
  'hr-talent-acquisition': UserSearch,
  'hr-learning-development': GraduationCap,
  'hr-performance-management': TrendingUp,
  'hr-compensation-benefits': Wallet,
}

interface HrSidebarProps {
  open?: boolean
  onClose?: () => void
}

// Visual language deliberately follows meristudy.meristem.com.ng (soft sage background, white
// cards, deep-green wordmark) rather than the navy/gold Learning Intelligence theme — see the
// `meristem` color scale in tailwind.config.ts. Structurally mirrors Sidebar.tsx's permission-
// filtered nav pattern, just styled differently and scoped to HR_UNIT_KEYS.
export function HrSidebar({ open = false, onClose }: HrSidebarProps) {
  const pathname = usePathname()
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return <aside className="hidden md:block w-64 shrink-0 bg-white h-screen border-r border-meristem-100" />
  }
  if (!session?.user) return null

  const isSuperAdmin = session.user.isSuperAdmin
  const visibleUnits = HR_UNIT_KEYS.filter((key) => isSuperAdmin || hasAccess(session.user.permissions?.[key], 'view'))
  const canSeeSummary = isSuperAdmin || hasAccess(session.user.permissions?.['hr-summary'], 'view') || visibleUnits.length > 0

  const renderLink = (key: PageKey, label: string, Icon: typeof LayoutGrid) => {
    const href = PAGE_ROUTES[key]
    const active = pathname === href
    return (
      <Link
        key={key}
        href={href}
        onClick={onClose}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          active ? 'bg-meristem-600 text-white' : 'text-slate-600 hover:bg-meristem-50 hover:text-meristem-800'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </Link>
    )
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 bg-white text-slate-600 flex flex-col h-screen border-r border-meristem-100
          transform transition-transform duration-200 ease-in-out
          md:relative md:inset-auto md:z-auto md:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand — Meristem wordmark, top-left, per the meristudy reference. Text placeholder
            until the actual logo asset is added to /public (see brainstorm notes). */}
        <div className="px-5 py-5 border-b border-meristem-100 flex items-center justify-between">
          <Link href="/hr" onClick={onClose} className="min-w-0">
            <p className="font-serif text-xl font-bold text-meristem-800 tracking-wide leading-none">MERISTEM</p>
            <p className="text-slate-400 text-[11px] mt-1">HR Dashboard</p>
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="md:hidden p-1 rounded-lg text-slate-400 hover:bg-meristem-50 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {canSeeSummary && renderLink('hr-summary', 'Summary', LayoutGrid)}

          {visibleUnits.length > 0 && (
            <>
              <p className="px-3 pt-4 pb-1 text-xs font-medium text-slate-400 uppercase tracking-wider">
                HR Units
              </p>
              {visibleUnits.map((key) => renderLink(key, PAGE_LABELS[key].replace('HR — ', ''), UNIT_ICONS[key]))}
            </>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-meristem-100 space-y-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-meristem-100 text-meristem-800 flex items-center justify-center text-xs font-semibold shrink-0">
              {session.user.name?.slice(0, 1).toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <p className="text-slate-700 text-xs font-medium truncate">{session.user.name}</p>
              <p className="text-slate-400 text-[11px] truncate">{isSuperAdmin ? 'Super Admin' : session.user.staffId || session.user.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-500 hover:bg-meristem-50 hover:text-meristem-800 text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
