'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ChevronDown, Users, UserSearch, GraduationCap, TrendingUp, Users2, Wallet } from 'lucide-react'
import { hasAccess, PAGE_LABELS, PAGE_ROUTES, HR_UNIT_KEYS } from '@/lib/permissions'

const UNIT_ICONS = {
  'hr-employee-services': Users,
  'hr-talent-acquisition': UserSearch,
  'hr-learning-development': GraduationCap,
  'hr-performance-management': TrendingUp,
  'hr-talent-management': Users2,
  'hr-compensation-benefits': Wallet,
} as const

interface UnitPageHeaderProps {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  /** Right-hand slot for the page's own controls (e.g. a period filter) — rendered next to Switch Unit. */
  actions?: React.ReactNode
}

// Every unit page renders this at the top — "return to summary" and "switch unit" per the brief,
// so someone doesn't have to rely on the (drawer-hidden-on-mobile) sidebar to move between units.
export function UnitPageHeader({ title, description, icon: Icon, actions }: UnitPageHeaderProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [switcherOpen, setSwitcherOpen] = useState(false)

  const isSuperAdmin = session?.user?.isSuperAdmin
  const otherUnits = HR_UNIT_KEYS.filter((key) => {
    if (PAGE_ROUTES[key] === pathname) return false
    return isSuperAdmin || hasAccess(session?.user?.permissions?.[key], 'view')
  })

  return (
    <div className="bg-white border-b border-meristem-100 px-4 sm:px-8 py-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <Link href="/hr" className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-meristem-800">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Summary
        </Link>

        <div className="flex items-center gap-2">
          {actions}
          {otherUnits.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-meristem-800 border border-meristem-200 rounded-lg px-3 py-1.5 hover:bg-meristem-50"
              >
                Switch Unit <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {switcherOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSwitcherOpen(false)} />
                  <div className="absolute right-0 mt-1 w-56 bg-white border border-meristem-100 rounded-lg shadow-lg z-20 py-1.5">
                    {otherUnits.map((key) => {
                      const UnitIcon = UNIT_ICONS[key]
                      return (
                        <Link
                          key={key}
                          href={PAGE_ROUTES[key]}
                          onClick={() => setSwitcherOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 hover:bg-meristem-50 hover:text-meristem-800"
                        >
                          <UnitIcon className="w-4 h-4 text-slate-400 shrink-0" />
                          {PAGE_LABELS[key].replace('HR — ', '')}
                        </Link>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-meristem-100 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-meristem-700" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">{title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  )
}
