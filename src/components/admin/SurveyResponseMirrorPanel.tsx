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
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryingAll, setRetryingAll] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/survey-responses')
      setResponses(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const failed = (responses || []).filter((r) => r.mirrorError)

  const retry = async (id: string) => {
    setRetryingId(id)
    try {
      await fetch(`/api/admin/survey-responses/${id}/retry-mirror`, { method: 'POST' })
      await load()
    } finally {
      setRetryingId(null)
    }
  }

  const retryAll = async () => {
    setRetryingAll(true)
    try {
      for (const r of failed) {
        await fetch(`/api/admin/survey-responses/${r.id}/retry-mirror`, { method: 'POST' })
      }
      await load()
    } finally {
      setRetryingAll(false)
    }
  }

  if (!loading && failed.length === 0) return null // nothing to show when everything's healthy

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <FileWarning className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Survey Responses — Sheet Sync Issues</p>
            <p className="text-xs text-slate-500 mt-0.5">
              These submissions saved successfully but failed to mirror into the Google Sheet. Retrying does not re-submit the form or duplicate any data.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {failed.length > 0 && (
            <button
              onClick={retryAll}
              disabled={retryingAll}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {retryingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Retry All ({failed.length})
            </button>
          )}
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {failed.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 border border-amber-200 bg-white rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800">
                  {r.staffName} · {STAGE_LABELS[r.stage] || r.stage} · <span className="text-slate-400 font-normal">{r.trainingName}</span>
                </p>
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {r.mirrorError}
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
