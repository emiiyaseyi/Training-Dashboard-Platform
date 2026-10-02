'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/hr/talent-management', label: 'Executive Summary' },
  { href: '/hr/talent-management/mobility-trends', label: 'Mobility Trends' },
  { href: '/hr/talent-management/promotion-trends', label: 'Promotion Trends' },
  { href: '/hr/talent-management/committees-performance', label: 'Committees & Performance' },
]

// Sub-navigation between the 4 Talent Management views — same pattern as TaSubNav (Talent
// Acquisition's own 4-tab strip), so TM has the same "view all the live sheet data" structure TA
// already has, rather than everything crammed onto one page.
export function TmSubNav() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 overflow-x-auto px-4 sm:px-8 border-b border-meristem-100 bg-white">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
