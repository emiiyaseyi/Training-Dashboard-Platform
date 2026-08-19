'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface BusinessUnitMultiSelectProps {
  value: string[] | 'ALL'
  onChange: (value: string[] | 'ALL') => void
  options: string[]
}

export function BusinessUnitMultiSelect({ value, onChange, options }: BusinessUnitMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const isAll = value === 'ALL'
  const selected = isAll ? [] : value

  const label = isAll
    ? 'All Business Units'
    : selected.length === 0
    ? 'Select Business Units…'
    : selected.length === 1
    ? selected[0]
    : `${selected.length} Business Units`

  const toggleAll = () => onChange('ALL')

  const toggleBU = (bu: string) => {
    const current = isAll ? [] : value
    const next = current.includes(bu) ? current.filter((b) => b !== bu) : [...current, bu]
    onChange(next.length === 0 ? 'ALL' : next)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs min-w-[180px] bg-white hover:bg-slate-50"
      >
        <span className="truncate text-slate-700">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          <button
            type="button"
            onClick={toggleAll}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 text-left"
          >
            <span className={isAll ? 'font-medium text-navy-700' : 'text-slate-700'}>All Business Units</span>
            {isAll && <Check className="w-3.5 h-3.5 text-navy-600" />}
          </button>
          <div className="border-t border-slate-100 my-1" />
          {options.map((bu) => {
            const checked = !isAll && selected.includes(bu)
            return (
              <label
                key={bu}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer"
              >
                <input type="checkbox" checked={checked} onChange={() => toggleBU(bu)} className="shrink-0" />
                <span className="text-slate-700 truncate">{bu}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
