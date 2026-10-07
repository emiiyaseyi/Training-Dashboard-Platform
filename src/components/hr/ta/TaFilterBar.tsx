'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/** Ported from the source repo's components/ui/FilterBar.tsx, restyled — writes the same
 * bu/role/officeType search params lib/ta-filters.ts already reads. The date range lives in the
 * separate TaPeriodFilter, placed in the page header's top-right actions slot (matching L&D's and
 * Talent Management's FilterBar position) rather than in this card. */
export function TaFilterBar({ bus, roles, officeTypes = [] }: { bus: string[]; roles: string[]; officeTypes?: string[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }

  const hasAnyFilter = ['bu', 'role', 'officeType'].some((k) => searchParams.get(k))

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-meristem-100 rounded-2xl p-4">
      <FilterSelect label="Business Unit" value={searchParams.get('bu') ?? ''} options={bus} onChange={(v) => setParam('bu', v)} />
      <FilterSelect label="Role" value={searchParams.get('role') ?? ''} options={roles} onChange={(v) => setParam('role', v)} />
      {officeTypes.length > 0 && <FilterSelect label="Office" value={searchParams.get('officeType') ?? ''} options={officeTypes} onChange={(v) => setParam('officeType', v)} />}
      {hasAnyFilter && (
        <button onClick={() => router.push('?')} className="text-xs font-medium text-meristem-700 underline hover:text-meristem-800">
          Clear filters
        </button>
      )}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-meristem-100 bg-meristem-50 px-2 py-1.5 text-xs text-slate-700">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}
