'use client'

import { useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { MONTHS, type PeriodFilter, type Month, filterLabel, resolveFilter } from '@/lib/filter-types'

interface FilterBarProps {
  availableYears: number[]
  value: PeriodFilter
  onChange: (f: PeriodFilter) => void
}

export function FilterBar({ availableYears, value, onChange }: FilterBarProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<PeriodFilter>(value)

  const currentYear = new Date().getFullYear()
  const currentMonth = MONTHS[new Date().getMonth()]
  const years = availableYears.length > 0 ? availableYears : [currentYear]
  const defaultYear = years[0] ?? currentYear

  function apply() {
    // Always resolve defaults before applying so API never gets undefined
    onChange(resolveFilter({ ...draft, year: draft.year ?? defaultYear }))
    setOpen(false)
  }

  function reset() {
    const f: PeriodFilter = { mode: 'all' }
    setDraft(f)
    onChange(f)
    setOpen(false)
  }

  return (
    <div className="relative no-print">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
      >
        <CalendarDays className="w-4 h-4 text-slate-400" />
        {filterLabel(value)}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-50 p-4 space-y-4">
          {/* Mode selector */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Period</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['all', 'ytd', 'year', 'range'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setDraft((p) => ({
                    ...p,
                    mode: m,
                    // Always seed defaults so filterLabel never shows "undefined"
                    year:      p.year      ?? defaultYear,
                    fromMonth: p.fromMonth ?? 'January',
                    toMonth:   p.toMonth   ?? currentMonth,
                  }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    draft.mode === m
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {m === 'all' ? 'All Time' : m === 'ytd' ? 'Year to Date' : m === 'year' ? 'Full Year' : 'Month Range'}
                </button>
              ))}
            </div>
          </div>

          {/* Year picker — shown for ytd, year, range */}
          {draft.mode !== 'all' && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Year</p>
              <select
                value={draft.year ?? currentYear}
                onChange={(e) => setDraft((p) => ({ ...p, year: parseInt(e.target.value) }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {/* Month range — only for 'range' */}
          {draft.mode === 'range' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">From</p>
                <select
                  value={draft.fromMonth ?? MONTHS[0]}
                  onChange={(e) => setDraft((p) => ({ ...p, fromMonth: e.target.value as Month }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">To</p>
                <select
                  value={draft.toMonth ?? MONTHS[11]}
                  onChange={(e) => setDraft((p) => ({ ...p, toMonth: e.target.value as Month }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <button
              onClick={apply}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={reset}
              className="px-3 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  )
}
