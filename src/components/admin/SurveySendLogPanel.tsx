'use client'

import { useEffect, useMemo, useState } from 'react'
import { History, Search } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { DataTable } from '@/components/ui/DataTable'

interface SendLogEntry {
  id: string
  trainingName: string
  stage: string
  staffName: string
  recipient: string
  isReminder: boolean
  success: boolean
  errorMessage: string | null
  sentAt: string
}

const STAGE_LABELS: Record<string, string> = { pre: 'Pre-Training', post1: 'Post-1', post2: 'Post-2' }

export function SurveySendLogPanel() {
  const [log, setLog] = useState<SendLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch('/api/admin/survey-send-log?limit=300')
      .then((r) => r.json())
      .then((data) => setLog(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return log.filter((r) => {
      if (stageFilter !== 'ALL' && r.stage !== stageFilter) return false
      if (typeFilter !== 'ALL' && (typeFilter === 'reminder') !== r.isReminder) return false
      if (statusFilter !== 'ALL' && (statusFilter === 'sent') !== r.success) return false
      if (q && !(r.trainingName.toLowerCase().includes(q) || r.staffName.toLowerCase().includes(q))) return false
      return true
    })
  }, [log, stageFilter, typeFilter, statusFilter, query])

  return (
    <SectionCard
      icon={History}
      title="Survey Send Log"
      description="A durable record of every survey email attempt — original sends and reminders — even after an attendee's status is overwritten by a later send."
    >
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by training or attendee…"
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs w-56"
              />
            </div>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
              <option value="ALL">All Stages</option>
              {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
              <option value="ALL">Original + Reminder</option>
              <option value="original">Original only</option>
              <option value="reminder">Reminder only</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
              <option value="ALL">Sent + Failed</option>
              <option value="sent">Sent only</option>
              <option value="failed">Failed only</option>
            </select>
          </div>
          <DataTable
            columns={[
              { key: 'sentAt', header: 'Sent', sortable: true, render: (r) => new Date(r.sentAt as string).toLocaleString() },
              { key: 'trainingName', header: 'Training', sortable: true },
              { key: 'stage', header: 'Stage', sortable: true, render: (r) => STAGE_LABELS[r.stage as string] || (r.stage as string) },
              { key: 'staffName', header: 'Attendee', sortable: true },
              { key: 'recipient', header: 'Sent To', sortable: true },
              { key: 'isReminder', header: 'Type', sortable: true, render: (r) => (r.isReminder ? 'Reminder' : 'Original') },
              {
                key: 'success', header: 'Status', align: 'center', sortable: true,
                render: (r) => (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {r.success ? 'Sent' : 'Failed'}
                  </span>
                ),
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
            emptyMessage="No survey emails have been sent yet."
          />
        </>
      )}
    </SectionCard>
  )
}
