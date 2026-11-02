'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Send, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Survey {
  id: string
  staffName: string
  email: string | null
  businessUnit: string | null
  role: string | null
  hireDate: string
  scheduledFor: string
  sentAt: string | null
  respondedAt: string | null
}

function statusOf(s: Survey): { label: string; className: string } {
  if (s.respondedAt) return { label: 'Responded', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (s.sentAt) return { label: 'Sent — awaiting response', className: 'bg-amber-50 text-amber-700 border-amber-200' }
  if (new Date(s.scheduledFor).getTime() > Date.now()) return { label: `Scheduled for ${new Date(s.scheduledFor).toLocaleDateString()}`, className: 'bg-slate-50 text-slate-600 border-slate-200' }
  return { label: 'Due to send', className: 'bg-blue-50 text-blue-700 border-blue-200' }
}

// Lets a TA admin trigger the "New Hire Experience Survey" — matched automatically from the Hires
// sheet against the staff roster and auto-scheduled 7 days after each hire's join date (see
// src/lib/new-hire-survey.ts). "Sync new hires" is a manual pull for anyone who doesn't want to
// wait for the next daily cron tick; the cron sweep otherwise does this and the actual sends on
// its own every day.
export function NewHireSurveyPanel() {
  const [surveys, setSurveys] = useState<Survey[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [unmatched, setUnmatched] = useState<{ candidateName: string; role: string; hireDate: string }[]>([])

  const load = () => {
    setLoading(true)
    fetch('/api/hr/admin/ta/new-hire-survey')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load.')
        setSurveys(data.surveys)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const sync = async () => {
    setSyncing(true)
    setError(null)
    setSyncNote(null)
    try {
      const res = await fetch('/api/hr/admin/ta/new-hire-survey/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed.')
      setSyncNote(`${data.syncResult.created} new hire(s) matched and scheduled. ${data.sendResult.sent} survey(s) sent (already due).`)
      setUnmatched(data.syncResult.unmatched)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  const sendNow = async (id: string) => {
    setSendingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/hr/admin/ta/new-hire-survey/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed.')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.')
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-slate-800">New Hire Experience Survey</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Matched automatically from the Hires tab against the staff roster, and sent 7 days after each new hire&apos;s join date. Use Sync to pull in recently-accepted hires now instead of waiting for the next daily run.
          </p>
        </div>
        <button
          onClick={sync}
          disabled={syncing}
          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-meristem-200 text-meristem-700 hover:bg-meristem-50 disabled:opacity-60"
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync new hires
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      {syncNote && <p className="text-xs text-emerald-700 mb-3 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {syncNote}</p>}
      {unmatched.length > 0 && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> {unmatched.length} hire(s) couldn&apos;t be matched to a staff record yet</p>
          <ul className="text-xs text-amber-700 space-y-0.5">
            {unmatched.map((u, i) => (
              <li key={i}>{u.candidateName} — {u.role} (joined {u.hireDate}). Check they&apos;re on the staff list with a matching name.</li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : !surveys || surveys.length === 0 ? (
        <p className="text-xs text-slate-500 py-4">No new hires matched yet — click Sync to pull in recently-accepted hires.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Business Unit</th>
                <th className="py-2 pr-3">Join Date</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((s) => {
                const status = statusOf(s)
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">{s.staffName}</td>
                    <td className="py-2 pr-3 text-slate-600">{s.businessUnit || '-'}</td>
                    <td className="py-2 pr-3 text-slate-600">{new Date(s.hireDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] ${status.className}`}>{status.label}</span>
                      {!s.email && <span className="ml-1.5 text-red-600">No email on file</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {!s.respondedAt && (
                        <button
                          onClick={() => sendNow(s.id)}
                          disabled={sendingId === s.id || !s.email}
                          className="flex items-center gap-1 text-[11px] font-semibold text-meristem-700 hover:text-meristem-900 disabled:opacity-50"
                        >
                          {sendingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          {s.sentAt ? 'Resend now' : 'Send now'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
