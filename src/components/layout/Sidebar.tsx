'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  GraduationCap,
  BadgeCheck,
  Building2,
  Upload,
  Settings,
  TrendingUp,
  BookOpen,
} from 'lucide-react'

const navItems = [
  { href: '/',                 label: 'Executive Overview',      icon: LayoutDashboard },
  { href: '/training',         label: 'Training Analytics',      icon: GraduationCap },
  { href: '/subscriptions',    label: 'Subscriptions',           icon: BadgeCheck },
  { href: '/business-units',   label: 'Business Units',          icon: Building2 },
  { href: '/upload',           label: 'Upload & Data',           icon: Upload },
  { href: '/admin',            label: 'Admin Settings',          icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 shrink-0 bg-slate-950 text-slate-300 flex flex-col h-screen">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Learning Intel</p>
            <p className="text-slate-500 text-xs">Dashboard Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 pt-2 pb-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
          Analytics
        </p>
        {navItems.slice(0, 4).map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}

        <p className="px-3 pt-4 pb-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
          Management
        </p>
        {navItems.slice(4).map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`nav-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-800">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Learning Intelligence Platform</span>
        </div>
        <p className="text-slate-600 text-xs mt-1">v1.0.0</p>
      </div>
    </aside>
  )
}
