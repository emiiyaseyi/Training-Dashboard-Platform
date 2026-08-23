'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'

interface Vendor {
  id: string
  name: string
}

interface VendorPickerProps {
  value: string
  onChange: (name: string) => void
  className?: string
  placeholder?: string
}

// Searchable vendor select with an inline "add new vendor" option — picking or adding a vendor
// here writes to the same Vendor table Admin → Vendors manages, so it's never just a free-text
// field that drifts out of sync with the actual vendor list.
export function VendorPicker({ value, onChange, className, placeholder }: VendorPickerProps) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/vendors').then((r) => r.json()).then((d) => setVendors(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  useEffect(() => { setQuery(value) }, [value])

  const q = query.trim().toLowerCase()
  const results = q ? vendors.filter((v) => v.name.toLowerCase().includes(q)) : vendors
  const exactMatch = vendors.some((v) => v.name.toLowerCase() === q)

  const select = (name: string) => {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  const addVendor = async () => {
    const name = query.trim()
    if (!name) return
    setAdding(true)
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (res.ok) {
        setVendors((prev) => [...prev, data])
        select(data.name)
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="relative">
      <input
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
        className={className}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[10rem] bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {results.map((v) => (
            <button
              key={v.id}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); select(v.name) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-slate-700"
            >
              {v.name}
            </button>
          ))}
          {q && !exactMatch && (
            <button
              onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); addVendor() }}
              disabled={adding}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-blue-600 flex items-center gap-1.5 border-t border-slate-100"
            >
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Add &quot;{query.trim()}&quot; as new vendor
            </button>
          )}
          {results.length === 0 && !q && (
            <p className="px-3 py-1.5 text-xs text-slate-400">No vendors yet — type to add one.</p>
          )}
        </div>
      )}
    </div>
  )
}
