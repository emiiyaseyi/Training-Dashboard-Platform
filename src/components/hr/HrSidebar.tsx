'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  LayoutGrid, Users, UserSearch, GraduationCap, TrendingUp, Users2, Wallet, LogOut, X, ChevronsLeft, ChevronsRight, Settings,
} from 'lucide-react'
import { hasAccess, PAGE_LABELS, PAGE_ROUTES, HR_UNIT_KEYS, type PageKey } from '@/lib/permissions'

const UNIT_ICONS: Record<(typeof HR_UNIT_KEYS)[number], typeof Users> = {
  'hr-employee-services': Users,
  'hr-talent-acquisition': UserSearch,
  'hr-learning-development': GraduationCap,
  'hr-performance-management': TrendingUp,
  'hr-talent-management': Users2,
  'hr-compensation-benefits': Wallet,
}

const COLLAPSE_STORAGE_KEY = 'hr-sidebar-collapsed'

interface HrSidebarProps {
  open?: boolean
  onClose?: () => void
}

// Visual language deliberately follows meristudy.meristem.com.ng (soft sage background, white
// cards, deep-green wordmark) rather than the navy/gold Learning Intelligence theme — see the
// `meristem` color scale in tailwind.config.ts. Structurally mirrors Sidebar.tsx's permission-
// filtered nav pattern, just styled differently and scoped to HR_UNIT_KEYS. Desktop collapse is
// separate from the mobile open/close drawer (`open`/`onClose`) — collapse only applies at md+;
// on mobile the drawer is always full-width when open, since a collapsed icon-only drawer would
// be pointless there (it's already an overlay, not competing for page width).
export function HrSidebar({ open = false, onClose }: HrSidebarProps) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSE_STORAGE_KEY)
    if (saved === 'true') setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next))
      return next
    })
  }

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
        title={collapsed ? label : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${collapsed ? 'md:justify-center md:px-2' : ''} ${
          active ? 'bg-meristem-600 text-white' : 'text-slate-600 hover:bg-meristem-50 hover:text-meristem-800'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
      </Link>
    )
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 shrink-0 bg-white text-slate-600 flex flex-col h-screen border-r border-meristem-100
          transform transition-[transform,width] duration-200 ease-in-out
          md:relative md:inset-auto md:z-auto md:translate-x-0
          w-64 ${collapsed ? 'md:w-[68px]' : 'md:w-64'}
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`px-5 py-5 border-b border-meristem-100 flex items-center ${collapsed ? 'md:justify-center md:px-2' : 'justify-between'}`}>
          <Link href="/hr" onClick={onClose} className={`min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
            <img src="/brand/meristem-logo.png" alt="Meristem" className="h-6 w-auto" />
            <p className="text-slate-400 text-[11px] mt-1.5">HR Dashboard</p>
          </Link>
          <Link href="/hr" onClick={onClose} className={`hidden ${collapsed ? 'md:block' : 'md:hidden'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset */}
            <img src="/brand/meristem-logo.png" alt="Meristem" className="h-5 w-auto" />
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
              <p className={`px-3 pt-4 pb-1 text-xs font-medium text-slate-400 uppercase tracking-wider ${collapsed ? 'md:hidden' : ''}`}>
                HR Units
              </p>
              {visibleUnits.map((key) => renderLink(key, PAGE_LABELS[key].replace('HR — ', ''), UNIT_ICONS[key]))}
            </>
          )}

          {isSuperAdmin && (
            <>
              <p className={`px-3 pt-4 pb-1 text-xs font-medium text-slate-400 uppercase tracking-wider ${collapsed ? 'md:hidden' : ''}`}>
                Super Admin
              </p>
              <Link
                href="/hr/admin"
                onClick={onClose}
                title={collapsed ? 'Admin Settings' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${collapsed ? 'md:justify-center md:px-2' : ''} ${
                  pathname === '/hr/admin' ? 'bg-meristem-600 text-white' : 'text-slate-600 hover:bg-meristem-50 hover:text-meristem-800'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span className={collapsed ? 'md:hidden' : ''}>Admin Settings</span>
              </Link>
            </>
          )}
        </nav>

        <button
          onClick={toggleCollapsed}
          className="hidden md:flex items-center gap-2 mx-3 mb-2 px-2 py-2 rounded-lg text-slate-400 hover:bg-meristem-50 hover:text-meristem-700 text-xs font-medium"
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4 mx-auto" /> : <><ChevronsLeft className="w-4 h-4" /> Collapse</>}
        </button>

        <div className={`px-4 py-4 border-t border-meristem-100 space-y-3 ${collapsed ? 'md:px-2' : ''}`}>
          <div className={`flex items-center gap-2.5 px-2 py-1.5 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-meristem-100 text-meristem-800 flex items-center justify-center text-xs font-semibold shrink-0">
              {session.user.name?.slice(0, 1).toUpperCase() || '?'}
            </div>
            <div className={`min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
              <p className="text-slate-700 text-xs font-medium truncate">{session.user.name}</p>
              <p className="text-slate-400 text-[11px] truncate">{isSuperAdmin ? 'Super Admin' : session.user.staffId || session.user.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title={collapsed ? 'Sign out' : undefined}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-500 hover:bg-meristem-50 hover:text-meristem-800 text-xs ${collapsed ? 'md:justify-center' : ''}`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className={collapsed ? 'md:hidden' : ''}>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
