'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, TrendingUp, Zap } from 'lucide-react'

const STAGES = [
  { href: '/insights/diagnostic', label: 'Diagnostic', hint: 'Why it’s happening', icon: Search },
  { href: '/insights/predictive', label: 'Predictive', hint: 'What’s heading for trouble', icon: TrendingUp },
  { href: '/insights/prescriptive', label: 'Prescriptive', hint: 'What to do about it', icon: Zap },
] as const

/** Top-level tab strip between the three Insights maturity stages — each stage is its own route
 * (so it's directly linkable/bookmarkable) with its own sub-tabs underneath for the specific
 * analyses within that stage, kept on a separate nav so a long list of sub-tabs never has to
 * compete visually with switching stages. */
export function InsightsStageNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto px-4 sm:px-8 border-b border-slate-200 bg-white">
      {STAGES.map((stage) => {
        const active = pathname.startsWith(stage.href)
        const Icon = stage.icon
        return (
          <Link
            key={stage.href}
            href={stage.href}
            className={`shrink-0 flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active ? 'border-navy-600 text-navy-800' : 'border-transparent text-slate-500 hover:text-navy-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{stage.label}</span>
            <span className="hidden sm:inline text-xs text-slate-400">— {stage.hint}</span>
          </Link>
        )
      })}
    </div>
  )
}
