'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const TABS = [
  { href: '/hr/talent-acquisition', label: 'Executive Summary' },
  { href: '/hr/talent-acquisition/financial-insights', label: 'Financial Insights' },
  { href: '/hr/talent-acquisition/bu-role-demographics', label: 'BU & Role Demographics' },
  { href: '/hr/talent-acquisition/efficiency-velocity', label: 'Efficiency & Velocity' },
]

/** Sub-navigation between the 4 Talent Acquisition views — ported 1:1 from the source repo's
 * `nav` (config/app.config.ts), which used top-level routes; here they're nested under this one
 * HR unit instead, so this tab strip replaces that top nav. Preserves the current filter query
 * string across tabs so switching views doesn't reset the period/BU/role filters. */
export function TaSubNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const qs = searchParams.toString()

  return (
    <div className="flex gap-1 overflow-x-auto px-4 sm:px-8 border-b border-meristem-100 bg-white">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={qs ? `${tab.href}?${qs}` : tab.href}
            className={`shrink-0 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active ? 'border-meristem-600 text-meristem-800' : 'border-transparent text-slate-500 hover:text-meristem-700'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
