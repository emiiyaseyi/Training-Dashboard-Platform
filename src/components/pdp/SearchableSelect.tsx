'use client'

import { useMemo, useState } from 'react'
import { Search, X, Check } from 'lucide-react'

// Single-select searchable combobox — used wherever a question's option list is long (the
// capability picker, Primary Role Responsibilities, etc.) so picking an option doesn't mean
// scrolling a giant native <select>.
export function SearchableSelect({
  options, value, onChange, placeholder = 'Search…',
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
    return base.slice(0, 50)
  }, [options, query])

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center justify-between border border-slate-300 rounded-md px-2.5 py-2 text-sm bg-white">
          <span>{value}</span>
          <button type="button" onClick={() => onChange('')} className="text-slate-400 hover:text-red-600 shrink-0 ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={placeholder}
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-md text-sm"
            />
          </div>
          {open && filtered.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {filtered.map((o) => (
                <button
                  key={o}
                  type="button"
                  onMouseDown={() => { onChange(o); setQuery('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                >
                  {o}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Multi-select searchable combobox — selected options show as removable chips, with an optional
// cap (maxSelect) disabling further picks once reached.
export function SearchableMultiSelect({
  options, value, onChange, maxSelect, placeholder = 'Search…',
}: {
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  maxSelect?: number | null
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const atLimit = maxSelect != null && value.length >= maxSelect
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = options.filter((o) => !value.includes(o) && (!q || o.toLowerCase().includes(q)))
    return base.slice(0, 50)
  }, [options, query, value])

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
              {v}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      {!atLimit && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder}
            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-md text-sm"
          />
          {open && filtered.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {filtered.map((o) => (
                <button
                  key={o}
                  type="button"
                  onMouseDown={() => { onChange([...value, o]); setQuery('') }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
                >
                  <span>{o}</span>
                  <Check className="w-3.5 h-3.5 text-transparent" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {maxSelect != null && <p className="text-[11px] text-slate-400 mt-1">{value.length} / {maxSelect} selected</p>}
    </div>
  )
}
