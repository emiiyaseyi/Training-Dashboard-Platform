'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck, LogIn, LogOut, Eye, Wrench, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination, paginate } from '@/components/ui/Pagination'

interface AuditEntry {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  action: 'login_success' | 'login_failure' | 'page_view' | 'admin_action'
  detail: string | null
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  login_success: 'Login — Success',
  login_failure: 'Login — Failed',
  page_view: 'Page View',
  admin_action: 'Admin Action',
}

const ACTION_ICONS: Record<string, typeof LogIn> = {
  login_success: LogIn,
  login_failure: LogOut,
  page_view: Eye,
  admin_action: Wrench,
}

const ACTION_STYLE: Record<string, string> = {
  login_success: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  login_failure: 'text-red-600 bg-red-50 border-red-200',
  page_view: 'text-slate-500 bg-slate-50 border-slate-200',
  admin_action: 'text-navy-700 bg-navy-50 border-navy-200',
}

const PAGE_SIZE = 25

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (actionFilter !== 'ALL') params.set('action', actionFilter)
      if (query.trim()) params.set('q', query.trim())
      const res = await fetch(`/api/admin/audit-log?${params.toString()}`)
      setEntries(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [actionFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1) }, [actionFilter, query])

  // Debounced client-side search-as-you-type against the already-loaded page, re-fetching from
  // the server only when the filter (action type) changes — the search box just refines what's
  // already in memory, keeping typing responsive without a request per keystroke.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      e.userName?.toLowerCase().includes(q) ||
      e.userEmail?.toLowerCase().includes(q) ||
      e.detail?.toLowerCase().includes(q)
    )
  }, [entries, query])

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Audit Trail"
        subtitle="Login attempts, page visits, and admin-level actions across the platform — most recent first."
        actions={
          <Link href="/admin" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Admin Settings
          </Link>
        }
      />

      <div className="p-4 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, or detail…"
              className="pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-64"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          >
            <option value="ALL">All Actions</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <p className="text-xs text-slate-400 p-5">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-400 p-5 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> No matching audit entries.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
                      <th className="px-4 py-2.5">Time</th>
                      <th className="px-4 py-2.5">Action</th>
                      <th className="px-4 py-2.5">User</th>
                      <th className="px-4 py-2.5">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(filtered, page, PAGE_SIZE).map((e) => {
                      const Icon = ACTION_ICONS[e.action] || ShieldCheck
                      return (
                        <tr key={e.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 border ${ACTION_STYLE[e.action] || 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                              <Icon className="w-3 h-3" /> {ACTION_LABELS[e.action] || e.action}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">
                            {e.userName || e.userEmail ? (
                              <>{e.userName}{e.userEmail ? <span className="text-slate-400"> ({e.userEmail})</span> : null}</>
                            ) : (
                              <span className="text-slate-400">Unknown</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{e.detail || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2">
                <Pagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
