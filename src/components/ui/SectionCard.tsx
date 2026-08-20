'use client'

import { useState, type ReactNode, type ComponentType } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface SectionCardProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: ReactNode
  defaultOpen?: boolean
  // Buttons that live in the header row and stay visible/clickable regardless of open state
  // (e.g. a Refresh action) — each should stopPropagation so clicking it doesn't also toggle.
  headerActions?: ReactNode
  accentClassName?: string // overrides the default white/slate border for a handful of sections
  children: ReactNode
}

// Every admin settings section renders through this — collapsed by default, so the page shows a
// scannable list of what's configurable instead of every panel's full content at once. Content
// only mounts once opened, so a panel that's never opened never fires its data fetch either.
export function SectionCard({ icon: Icon, title, description, defaultOpen = false, headerActions, accentClassName, children }: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${accentClassName || 'border-slate-200 bg-white'}`}>
      <div className="w-full flex items-start justify-between gap-3 p-5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-start gap-3 text-left flex-1 min-w-0">
          <Icon className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            {description && <div className="text-xs text-slate-500 mt-0.5">{description}</div>}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {headerActions}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  )
}
