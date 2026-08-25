'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Loader2, Send } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

export function ReportAutomationPanel() {
  const [enabled, setEnabled] = useState(false)
  const [sendDay, setSendDay] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; period: string; businessUnitsProcessed: number; errors: { businessUnit: string; recipient?: string; message: string }[] } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/report-automation')
      const data = await res.json()
      setEnabled(!!data.enabled)
      setSendDay(data.sendDay ?? 1)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const save = async (next: { enabled: boolean; sendDay: number }) => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/report-automation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  const sendNow = async () => {
    if (!confirm('Send the report to every active Business Unit head right now? This emails real people immediately, independent of the automation schedule.')) return
    setSendingNow(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/admin/report-automation/send-now', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSendResult(data)
      } else {
        alert(data.error || 'Failed to send reports.')
      }
    } finally {
      setSendingNow(false)
    }
  }

  return (
    <SectionCard
      icon={CalendarClock}
      title="Report Automation"
      description="Automatically emails each Business Unit Head their monthly report (with a quarterly comparison folded in every quarter-end month). Always covers the most recently completed month — e.g. a report sent in September covers August."
    >
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => { setEnabled(e.target.checked); save({ enabled: e.target.checked, sendDay }) }}
            />
            Automatically send monthly reports
          </label>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Send on day</label>
            <select
              value={sendDay}
              disabled={!enabled}
              onChange={(e) => { const v = Number(e.target.value); setSendDay(v); save({ enabled, sendDay: v }) }}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm disabled:opacity-50"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-xs text-slate-400">of each month</span>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            {saved && <span className="text-xs text-emerald-600">Saved</span>}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={sendNow}
              disabled={sendingNow}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {sendingNow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send Now (test / force send)
            </button>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Sends immediately to every active recipient below, regardless of the schedule above. Useful for testing before turning automation on.
            </p>
          </div>

          {sendResult && (
            <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-slate-700">
                {sendResult.period}: sent to <span className="text-emerald-700 font-medium">{sendResult.sent}</span> recipient{sendResult.sent === 1 ? '' : 's'} across {sendResult.businessUnitsProcessed} Business Unit{sendResult.businessUnitsProcessed === 1 ? '' : 's'}
                {sendResult.failed > 0 && <span className="text-red-600 font-medium"> — {sendResult.failed} failed</span>}.
              </p>
              {sendResult.errors.length > 0 && (
                <ul className="text-red-600 space-y-0.5">
                  {sendResult.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e.businessUnit}{e.recipient ? ` (${e.recipient})` : ''}: {e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}
