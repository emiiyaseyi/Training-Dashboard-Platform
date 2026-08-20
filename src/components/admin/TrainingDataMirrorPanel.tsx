'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2, FileWarning } from 'lucide-react'

interface AttendeeRow {
  id: string
  scheduleId: string
  staffName: string
  trainingName: string
  createdAt: string
  trainingDataSyncError: string | null
}

export function TrainingDataMirrorPanel() {
  const [rows, setRows] = useState<AttendeeRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [autoResolving, setAutoResolving] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryingAll, setRetryingAll] = useState(false)

  const retryOne = async (r: AttendeeRow) =>
    fetch(`/api/admin/training-schedule/${r.scheduleId}/attendees/${r.id}/retry-training-data-mirror`, { method: 'POST' }).catch(() => {})

  const fetchRows = async (): Promise<AttendeeRow[] | null> => {
    setLoadError('')
    try {
      const res = await fetch('/api/admin/training-data-mirror-status')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to load (${res.status}).`)
      }
      const data = (await res.json()) as AttendeeRow[]
      setRows(data)
      return data
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load Training Data sync status.')
      return null
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true)
      const initial = await fetchRows()
      setLoading(false)
      if (initial && initial.length > 0) {
        setAutoResolving(true)
        for (const r of initial) await retryOne(r)
        await fetchRows()
        setAutoResolving(false)
      }
    })()
  }, [])

  const retry = async (r: AttendeeRow) => {
    setRetryingId(r.id)
    try {
      await retryOne(r)
      await fetchRows()
    } finally {
      setRetryingId(null)
    }
  }

  const retryAll = async () => {
    setRetryingAll(true)
    try {
      for (const r of rows || []) await retryOne(r)
      await fetchRows()
    } finally {
      setRetryingAll(false)
    }
  }

  const refresh = async () => {
    setLoading(true)
    await fetchRows()
    setLoading(false)
  }

  const needsAttention = rows || []

  return (
    <div className={`rounded-xl border shadow-sm p-5 ${needsAttention.length > 0 || loadError ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          {needsAttention.length > 0 || loadError ? (
            <FileWarning className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold text-slate-800">Training Data Sheet Sync</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Every attendee added to a schedule is mirrored into the Training Data sheet. Re-checked and retried automatically on load.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {needsAttention.length > 0 && (
            <button
              onClick={retryAll}
              disabled={retryingAll}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {retryingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Retry All ({needsAttention.length})
            </button>
          )}
          <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : loadError ? (
        <p className="text-xs text-red-600">{loadError}</p>
      ) : autoResolving ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Auto-retrying unsynced attendees…
        </p>
      ) : needsAttention.length === 0 ? (
        <p className="text-xs text-emerald-700">All attendees are synced to the Training Data sheet.</p>
      ) : (
        <div className="space-y-2">
          {needsAttention.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 border border-amber-200 bg-white rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800">
                  {r.staffName} · <span className="text-slate-400 font-normal">{r.trainingName}</span>
                </p>
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {r.trainingDataSyncError || 'Not yet confirmed synced — click Retry to sync now.'}
                </p>
              </div>
              <button
                onClick={() => retry(r)}
                disabled={retryingId === r.id}
                className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-2.5 py-1 hover:bg-navy-50 disabled:opacity-50 shrink-0"
              >
                {retryingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Retry
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
