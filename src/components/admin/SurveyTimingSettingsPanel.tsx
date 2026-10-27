'use client'

import { useEffect, useState } from 'react'
import { Mail, Loader2 } from 'lucide-react'
import Link from 'next/link'

// Send timing, reminders, expiry and upload limit for survey emails — the same record the Survey
// Automation page edits. The settings API replaces every field on save, so the full object that was
// loaded (including mirror sheet names) is posted back, never just the fields shown here.
type Settings = Record<string, unknown> & {
  preDaysBefore: number
  preReminderIntervalDays: number
  post1DaysAfter: number
  post2DaysAfter: number
  expiryEnabled: boolean
  expiryDays: number
  maxFileUploadMB: number
  excludeDefaultCcOnReminders: boolean
}

const inputCls = 'w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1'

export function SurveyTimingSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/survey-settings').then((r) => r.json()).then(setSettings).catch(() => setError('Could not load settings.'))
  }, [])

  const set = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s))

  const save = async () => {
    if (!settings) return
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch('/api/admin/survey-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      if (!res.ok) { setError('Failed to save settings.'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Mail className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Survey Email Timing &amp; Reminders</p>
          <p className="text-xs text-slate-500 mt-0.5">
            When the automated check sends each survey, how often reminders go out, and when unfilled surveys expire. Training schedules and questions are on the{' '}
            <Link href="/admin/surveys" className="text-navy-600 hover:underline">Survey Automation page</Link>.
          </p>
        </div>
      </div>

      {!settings ? (
        <p className="text-xs text-slate-400">{error || 'Loading…'}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-xs text-slate-500">
              Pre-Training — days before start
              <input type="number" min={0} value={settings.preDaysBefore} onChange={(e) => set({ preDaysBefore: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500">
              Pre-Training reminder — every N days
              <input type="number" min={1} value={settings.preReminderIntervalDays} onChange={(e) => set({ preReminderIntervalDays: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500">
              Post-1 — days after end
              <input type="number" min={0} value={settings.post1DaysAfter} onChange={(e) => set({ post1DaysAfter: Number(e.target.value) })} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500">
              Post-2 — days after end
              <input type="number" min={0} value={settings.post2DaysAfter} onChange={(e) => set({ post2DaysAfter: Number(e.target.value) })} className={inputCls} />
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Pre-Training also sends one extra reminder the day before the training starts, and keeps nudging until the start date even after the person responds. Post-1/Post-2 remind daily until the person responds.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-500 flex flex-col">
              <span className="flex items-center gap-1.5 h-[18px]">
                <input type="checkbox" checked={settings.expiryEnabled} onChange={(e) => set({ expiryEnabled: e.target.checked })} />
                Expire unfilled surveys after (days)
              </span>
              <input type="number" min={1} disabled={!settings.expiryEnabled} value={settings.expiryDays} onChange={(e) => set({ expiryDays: Number(e.target.value) })} className={`${inputCls} disabled:opacity-50`} />
            </label>
            <label className="text-xs text-slate-500">
              Per-file upload limit
              <select value={settings.maxFileUploadMB} onChange={(e) => set({ maxFileUploadMB: Number(e.target.value) })} className={inputCls}>
                {[5, 10, 20, 50, 100].map((mb) => <option key={mb} value={mb}>{mb} MB</option>)}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={settings.excludeDefaultCcOnReminders} onChange={(e) => set({ excludeDefaultCcOnReminders: e.target.checked })} />
            Exclude the platform-wide Default Cc from reminder emails (the original send always includes it)
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </>
      )}
    </div>
  )
}
