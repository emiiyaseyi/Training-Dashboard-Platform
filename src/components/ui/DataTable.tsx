'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { Pagination, paginate } from '@/components/ui/Pagination'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  // Opt-in per column — clicking the header cycles asc/desc/unsorted, comparing the row's raw
  // value at `key` (not the rendered output), so a column with a custom render() still sorts by
  // its real underlying value (e.g. an ISO date string, which sorts correctly as plain text).
  sortable?: boolean
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[]
  data: T[] | unknown
  emptyMessage?: string
  caption?: string
  pageSize?: number // set to 0 to disable pagination
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data available.',
  caption,
  pageSize = 25,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const rows: T[] = Array.isArray(data) ? data : []

  // Searches every field of every row (not just what's displayed), so it still finds a match
  // even when the visible column uses a custom render() that reformats the underlying value.
  const q = query.trim().toLowerCase()
  const filteredRows = q
    ? rows.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)))
    : rows

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows
    const { key, dir } = sort
    const mul = dir === 'asc' ? 1 : -1
    return [...filteredRows].sort((a, b) => {
      const av = a[key as keyof T]
      const bv = b[key as keyof T]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul
      return String(av ?? '').localeCompare(String(bv ?? '')) * mul
    })
  }, [filteredRows, sort])

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  const pageRows = pageSize > 0 ? paginate(sortedRows, page, pageSize) : sortedRows
  // Based on the UNFILTERED count, not filteredRows — otherwise the search box would disappear
  // mid-typing as soon as a query narrows the results down to a single page.
  const showSearch = pageSize > 0 && rows.length > pageSize

  // Filters/re-fetches/searches change the row count out from under us — snap back to page 1
  // rather than stranding the user on a now-empty page past the new last page.
  useEffect(() => {
    setPage(1)
  }, [filteredRows.length])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {(caption || showSearch) && (
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          {caption && <p className="text-sm font-semibold text-slate-800">{caption}</p>}
          {showSearch && (
            <div className="relative ml-auto">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48"
              />
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((col, colIdx) => (
                <th
                  key={`${colIdx}-${col.header}`}
                  onClick={col.sortable ? () => toggleSort(String(col.key)) : undefined}
                  className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.sortable ? 'cursor-pointer select-none hover:text-slate-700' : ''}`}
                >
                  <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                    {col.header}
                    {col.sortable && (
                      sort?.key === col.key
                        ? sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        : <ArrowUpDown className="w-3 h-3 text-slate-300" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400 text-sm">
                  {q ? 'No matches for that search.' : emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  {columns.map((col, colIdx) => (
                    <td
                      key={`${colIdx}-${col.header}`}
                      className={`px-4 py-3 text-slate-700 ${
                        col.align === 'right' ? 'text-right tabular-nums' :
                        col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {col.render
                        ? col.render(row)
                        : String(row[col.key as keyof T] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && (
        <div className="px-4 border-t border-slate-100">
          <Pagination page={page} totalItems={sortedRows.length} pageSize={pageSize} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
