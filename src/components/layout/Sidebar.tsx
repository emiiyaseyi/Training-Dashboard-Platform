'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  GraduationCap,
  BadgeCheck,
  Building2,
  Upload,
  Settings,
  TrendingUp,
  BookOpen,
  FileBarChart,
  Layers,
  LogOut,
  UserCircle,
  UserX,
  Mail,
  Award,
  HelpCircle,
  X,
  Database,
  Users,
} from 'lucide-react'
import { hasAccess, type PageKey } from '@/lib/permissions'

const ANALYTICS_PAGE_COUNT = 7

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; page: PageKey }[] = [
  { href: '/',               label: 'Executive Overview',      icon: LayoutDashboard, page: 'executive-overview' },
  { href: '/training',       label: 'Training Analytics',      icon: GraduationCap,   page: 'training-analytics' },
  { href: '/subscriptions',  label: 'Subscriptions',           icon: BadgeCheck,      page: 'subscriptions' },
  { href: '/business-units', label: 'Business Units',          icon: Building2,       page: 'business-units' },
  { href: '/capabilities',   label: 'Capability Coverage',     icon: Layers,          page: 'capability-coverage' },
  { href: '/yet-to-attend',  label: 'Yet to Attend Training',  icon: UserX,           page: 'yet-to-attend' },
  { href: '/talent-members', label: 'Talent Members',          icon: Award,           page: 'talent-members' },
  { href: '/reports',        label: 'Report Generation',       icon: FileBarChart,    page: 'report-generation' },
  { href: '/upload',         label: 'Upload & Data',           icon: Upload,          page: 'upload-data' },
  { href: '/admin/employees', label: 'Employees',              icon: Users,           page: 'admin-settings' },
  { href: '/admin/records',  label: 'Manage Records',          icon: Database,        page: 'admin-settings' },
  { href: '/admin/surveys',  label: 'Survey Automation',       icon: Mail,            page: 'admin-settings' },
  { href: '/admin',          label: 'Admin Settings',          icon: Settings,        page: 'admin-settings' },
]

interface SidebarProps {
  // Off-canvas drawer state — only meaningful below the md breakpoint. Desktop always renders
  // the sidebar statically, ignoring both.
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return <aside className="hidden md:block w-64 shrink-0 bg-navy-700 h-screen" />
  }
  if (!session?.user) return null

  const isSuperAdmin = session.user.isSuperAdmin
  const visibleItems = navItems.filter(
    (item) => isSuperAdmin || hasAccess(session.user.permissions?.[item.page], 'view')
  )
  const analyticsItems = visibleItems.filter((item) => navItems.indexOf(item) < ANALYTICS_PAGE_COUNT)
  const managementItems = visibleItems.filter((item) => navItems.indexOf(item) >= ANALYTICS_PAGE_COUNT)

  const renderLink = ({ href, label, icon: Icon }: (typeof navItems)[number]) => {
    const active = pathname === href
    return (
      <Link
        key={href}
        href={href}
        onClick={onClose}
        className={`nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
          active
            ? 'bg-gold-400 text-navy-800'
            : 'text-slate-400 hover:bg-navy-600 hover:text-slate-100'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </Link>
    )
  }

  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on tap outside it */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 bg-navy-700 text-slate-300 flex flex-col h-screen
          transform transition-transform duration-200 ease-in-out
          md:relative md:inset-auto md:z-auto md:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
      {/* Brand */}
      <div className="px-6 py-5 border-b border-navy-500/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gold-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-navy-800" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">Learning Intel</p>
            <p className="text-slate-500 text-xs">Dashboard Platform</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="md:hidden ml-auto p-1 rounded-lg text-slate-400 hover:bg-navy-600 hover:text-slate-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {analyticsItems.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
              Analytics
            </p>
            {analyticsItems.map(renderLink)}
          </>
        )}

        {managementItems.length > 0 && (
          <>
            <p className="px-3 pt-4 pb-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
              Management
            </p>
            {managementItems.map(renderLink)}
          </>
        )}
      </nav>

      {/* User / footer */}
      <div className="px-4 py-4 border-t border-navy-500/40 space-y-3">
        <Link href="/account" onClick={onClose} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-navy-600">
          <UserCircle className="w-6 h-6 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-slate-200 text-xs font-medium truncate">{session.user.name}</p>
            <p className="text-slate-500 text-[11px] truncate">
              {isSuperAdmin ? 'Super Admin' : session.user.staffId || session.user.email}
            </p>
          </div>
        </Link>
        <Link
          href="/help"
          onClick={onClose}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
            pathname === '/help' ? 'bg-gold-400 text-navy-800' : 'text-slate-400 hover:bg-navy-600 hover:text-slate-100'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Help & FAQ
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-400 hover:bg-navy-600 hover:text-slate-100 text-xs"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
        <div className="flex items-center gap-2 text-slate-500 text-xs px-2">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Learning Intelligence Platform</span>
        </div>
      </div>
      </aside>
    </>
  )
}
