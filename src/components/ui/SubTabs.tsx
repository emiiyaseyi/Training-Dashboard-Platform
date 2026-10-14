'use client'

export interface SubTab {
  key: string
  label: string
}

interface SubTabsProps {
  tabs: SubTab[]
  active: string
  onChange: (key: string) => void
}

/** Lightweight in-page tab strip for splitting one stage's analyses across several panels
 * instead of one long scroll — client state only (no routing), since every panel's data is
 * already fetched together for the stage and switching is just a show/hide. */
export function SubTabs({ tabs, active, onChange }: SubTabsProps) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === tab.key ? 'border-navy-600 text-navy-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
