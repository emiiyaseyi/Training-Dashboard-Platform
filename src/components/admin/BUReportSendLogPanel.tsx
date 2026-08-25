'use client'

import { useEffect, useState } from 'react'
import { History, CheckCircle2, XCircle } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { Pagination, paginate } from '@/components/ui/Pagination'

interface LogEntry {
  id: string
  businessUnit: string
  recipientEmail: string
  recipientName: string
  period: string
  isQuarterly: boolean
  success: boolean
  errorMessage: string | null
  sentAt: string
}

const PAGE_SIZE = 15

export function BUReportSendLogPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetch('/api/admin/bu-report-send-log')
      .then((r) => r.json())
      .then((d) => setLogs(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <SectionCard
      icon={History}
      title="BU Report Send History"
      description="Every report send attempt to a Business Unit Head, success or failure — most recent first."
    >
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-slate-400">No reports sent yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Business Unit</th>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginate(logs, page, PAGE_SIZE).map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(l.sentAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-700">{l.businessUnit}</td>
                    <td className="px-3 py-2 text-slate-600">{l.recipientName} <span className="text-slate-400">({l.recipientEmail})</span></td>
                    <td className="px-3 py-2 text-slate-600">{l.period}{l.isQuarterly && <span className="ml-1 text-[10px] text-gold-600 bg-gold-50 border border-gold-200 rounded-full px-1.5 py-0.5">+Quarterly</span>}</td>
                    <td className="px-3 py-2">
                      {l.success ? (
                        <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Sent</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600" title={l.errorMessage || ''}><XCircle className="w-3.5 h-3.5" /> Failed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalItems={logs.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      )}
    </SectionCard>
  )
}
