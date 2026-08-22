'use client'

import { useEffect, useState } from 'react'
import { GitCompareArrows, Check, X, Loader2, CheckCheck } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { Pagination, paginate } from '@/components/ui/Pagination'

interface TrainingSnapshot {
  staffId: string
  staffName: string
  businessUnit: string
  cost: number
  hours: number | null
  trainingType: string | null
  capability: string | null
  month: string
}

interface PendingChange {
  id: string
  existingRecordId: string
  oldData: TrainingSnapshot
  newData: TrainingSnapshot
  changedFields: string[]
  detectedAt: string
}

const FIELD_LABELS: Record<keyof TrainingSnapshot, string> = {
  staffId: 'Staff ID',
  staffName: 'Name',
  businessUnit: 'Business Unit',
  cost: 'Cost',
  hours: 'Hours',
  trainingType: 'Training Type',
  capability: 'Capability',
  month: 'Month',
}

const PAGE_SIZE = 20

export function TrainingRecordChangesPanel() {
  const [changes, setChanges] = useState<PendingChange[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [acceptingAll, setAcceptingAll] = useState(false)
  const [page, setPage] = useState(1)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/training-record-changes')
      setChanges(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const accept = async (id: string) => {
    setActingId(id)
    try {
      await fetch(`/api/admin/training-record-changes/${id}/accept`, { method: 'POST' })
      await load()
    } finally {
      setActingId(null)
    }
  }

  const reject = async (id: string) => {
    setActingId(id)
    try {
      await fetch(`/api/admin/training-record-changes/${id}/reject`, { method: 'POST' })
      await load()
    } finally {
      setActingId(null)
    }
  }

  const acceptAll = async () => {
    if (!confirm(`Apply all ${changes.length} detected edits? Where a Staff ID is being corrected, every other record under the old ID (Training Data, Subscriptions, KSS) is updated to the new one too.`)) return
    setAcceptingAll(true)
    try {
      await fetch('/api/admin/training-record-changes/accept-all', { method: 'POST' })
      setPage(1)
      await load()
    } finally {
      setAcceptingAll(false)
    }
  }

  const pageItems = paginate(changes, page, PAGE_SIZE)

  return (
    <SectionCard
      icon={GitCompareArrows}
      title={`Training Data Changes to Review (${changes.length})`}
      description="When a re-sync finds a row that looks like an edit to something already imported (same name, training, and month, but other fields differ) it's held here instead of applied automatically. “Previous” is what's stored from the last sync; “Current” is what the sheet says right now. Accepting a Staff ID correction updates it everywhere that ID appears, not just this one row."
      headerActions={
        changes.length > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); acceptAll() }}
            disabled={acceptingAll}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-2.5 py-1.5 hover:bg-navy-700 disabled:opacity-50"
          >
            {acceptingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            Accept All
          </button>
        ) : undefined
      }
    >
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : changes.length === 0 ? (
        <p className="text-xs text-slate-400">No pending edits — every synced row matches what&apos;s already imported.</p>
      ) : (
        <div className="space-y-3">
          {pageItems.map((c) => (
            <div key={c.id} className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">
                {c.newData.staffName || c.oldData.staffName}
                <span className="text-slate-400 font-normal"> — {c.newData.month || c.oldData.month}</span>
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full min-w-[420px]">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="font-medium pb-1.5 pr-3">Field</th>
                      <th className="font-medium pb-1.5 pr-3">Previous</th>
                      <th className="font-medium pb-1.5">Current (in sheet)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.changedFields.map((field) => (
                      <tr key={field} className="border-t border-amber-100">
                        <td className="py-1 pr-3 text-slate-500">{FIELD_LABELS[field as keyof TrainingSnapshot] || field}</td>
                        <td className="py-1 pr-3 text-red-700">{String(c.oldData[field as keyof TrainingSnapshot] ?? '—')}</td>
                        <td className="py-1 text-emerald-700 font-medium">{String(c.newData[field as keyof TrainingSnapshot] ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={() => accept(c.id)}
                  disabled={actingId === c.id}
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg px-2.5 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Accept
                </button>
                <button
                  onClick={() => reject(c.id)}
                  disabled={actingId === c.id}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Dismiss
                </button>
              </div>
            </div>
          ))}
          <Pagination page={page} totalItems={changes.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      )}
    </SectionCard>
  )
}
