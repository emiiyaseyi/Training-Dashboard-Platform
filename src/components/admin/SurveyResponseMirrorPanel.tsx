'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2, FileWarning } from 'lucide-react'

interface ResponseRow {
  id: string
  stage: string
  submittedAt: string
  staffName: string
  trainingName: string
  mirrorSyncedAt: string | null
  mirrorError: string | null
}

const STAGE_LABELS: Record<string, string> = { pre: 'Pre-Training', post1: 'Post-1', post2: 'Post-2' }

export function SurveyResponseMirrorPanel() {
  const [responses, setResponses] = useState<ResponseRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [autoResolving, setAutoResolving] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const fetchResponses = async (): Promise<ResponseRow[] | null> => {
    setLoadError('')
    try {
      const res = await fetch('/api/admin/survey-responses')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to load (${res.status}).`)
      }
      const data = (await res.json()) as ResponseRow[]
      setResponses(data)
      return data
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load survey responses.')
      return null
    }
  }

  // On mount: load, then automatically retry anything not yet confirmed synced — no manual click
  // needed for the common case (a transient failure, or a response that predates sync tracking).
  useEffect(() => {
    (async () => {
      setLoading(true)
      const initial = await fetchResponses()
      setLoading(false)
      const pending = (initial || []).filter((r) => !r.mirrorSyncedAt)
      if (pending.length > 0) {
        setAutoResolving(true)
        for (const r of pending) {
          await fetch(`/api/admin/survey-responses/${r.id}/retry-mirror`, { method: 'POST' }).catch(() => {})
        }
        await fetchResponses()
        setAutoResolving(false)
      }
    })()
  }, [])

  const needsAttention = (responses || []).filter((r) => !r.mirrorSyncedAt)

  const retry = async (id: string) => {
    setRetryingId(id)
    try {
      await fetch(`/api/admin/survey-responses/${id}/retry-mirror`, { method: 'POST' })
      await fetchResponses()
    } finally {
      setRetryingId(null)
    }
  }

  const refresh = async () => {
    setLoading(true)
    await fetchResponses()
    setLoading(false)
  }

  const [retryingAll, setRetryingAll] = useState(false)
  const retryAll = async () => {
    setRetryingAll(true)
    try {
      for (const r of needsAttention) {
        await fetch(`/api/admin/survey-responses/${r.id}/retry-mirror`, { method: 'POST' })
      }
      await fetchResponses()
    } finally {
      setRetryingAll(false)
    }
  }

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
            <p className="text-sm font-semibold text-slate-800">Survey Response Sheet Sync</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Every submission is automatically re-checked and retried on load — nothing here requires manual action unless a retry keeps failing.
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
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Auto-retrying unsynced responses…
        </p>
      ) : needsAttention.length === 0 ? (
        <p className="text-xs text-emerald-700">All survey responses are synced to their Google Sheet tabs.</p>
      ) : (
        <div className="space-y-2">
          {needsAttention.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 border border-amber-200 bg-white rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800">
                  {r.staffName} · {STAGE_LABELS[r.stage] || r.stage} · <span className="text-slate-400 font-normal">{r.trainingName}</span>
                </p>
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {r.mirrorError || 'Still not synced after an automatic retry — check the tab name and that the spreadsheet is shared as Editor.'}
                </p>
              </div>
              <button
                onClick={() => retry(r.id)}
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
