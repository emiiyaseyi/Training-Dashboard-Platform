'use client'

import { useEffect, useState } from 'react'
import { Pagination, paginate } from '@/components/ui/Pagination'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
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
  const rows: T[] = Array.isArray(data) ? data : []
  const pageRows = pageSize > 0 ? paginate(rows, page, pageSize) : rows

  // Filters/re-fetches change the row count out from under us — snap back to page 1 rather than
  // stranding the user on a now-empty page past the new last page.
  useEffect(() => {
    setPage(1)
  }, [rows.length])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {caption && (
        <div className="px-5 py-3.5 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">{caption}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((col, colIdx) => (
                <th
                  key={`${colIdx}-${col.header}`}
                  className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400 text-sm">
                  {emptyMessage}
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
          <Pagination page={page} totalItems={rows.length} pageSize={pageSize} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
