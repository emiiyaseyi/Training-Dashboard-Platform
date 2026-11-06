'use client'

import { useEffect, useState } from 'react'
import { PartyPopper, Loader2, Send, Cake, Award, History, Clock, PlayCircle } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

interface Settings {
  senderName: string
  fromAddress: string | null
  ccEmails: string | null
  birthdaySubject: string
  birthdayBody: string
  birthdayEnabled: boolean
  anniversarySubject: string
  anniversaryBody: string
  anniversaryEnabled: boolean
}

interface UpcomingCelebration { staffId: string; name: string; month: number; day: number; daysAway: number }
interface UpcomingAnniversary extends UpcomingCelebration { years: number }
interface SendLogEntry { staffId: string; staffName: string; type: 'birthday' | 'anniversary'; year: number; sentAt: string }
interface SweepRun { ranAt: string; birthdaysSent: number; anniversariesSent: number; errors: string | null }
interface Status {
  upcoming: { birthdays: UpcomingCelebration[]; anniversaries: UpcomingAnniversary[] }
  sendLog: SendLogEntry[]
  sweepRuns: SweepRun[]
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtMonthDay = (month: number, day: number) => `${MONTH_NAMES[month - 1]} ${day}`
const fmtDaysAway = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`)
// Lagos has no DST, so the stored UTC instant minus nothing extra, displayed with the WAT offset, is exact.
const fmtLagosDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WAT'

function UpcomingList<T extends { staffId: string; name: string }>({ icon: Icon, title, items, render }: { icon: typeof Cake; title: string; items: T[]; render: (item: T) => string }) {
  return (
    <div className="flex-1 min-w-[220px]">
      <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-slate-400" /> {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] text-slate-400">None found.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.staffId} className="flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <span className="font-medium text-slate-700">{item.name}</span>
              <span className="text-slate-400">{render(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PauseToggle({ enabled, onChange }: { enabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer select-none">
      <input type="checkbox" checked={!enabled} onChange={(e) => onChange(!e.target.checked)} className="w-3.5 h-3.5" />
      <span className={enabled ? 'text-slate-500' : 'text-amber-700'}>
        {enabled ? 'Pause this mail' : 'Paused — no automatic mail will go out'}
      </span>
    </label>
  )
}

function TestSendRow({ type }: { type: 'birthday' | 'anniversary' }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const send = async () => {
    if (!email.trim()) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/hr/talent-management/celebrations/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, to: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send test email.')
      setResult({ ok: true, message: `Sent to ${email.trim()}.` })
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@meristemng.com"
        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs w-56"
      />
      <button
        type="button"
        onClick={send}
        disabled={sending || !email.trim()}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        Send test {type}
      </button>
      {result && <span className={`text-[11px] ${result.ok ? 'text-meristem-700' : 'text-rose-600'}`}>{result.message}</span>}
    </div>
  )
}

export function CelebrationsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ ok: boolean; message: string } | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/hr/talent-management/celebrations')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setSettings(data) })
      .catch(() => setError('Failed to load Celebrations settings.'))
      .finally(() => setLoading(false))
  }

  const loadStatus = () => {
    fetch('/api/hr/talent-management/celebrations/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setStatus(data) })
      .catch(() => {})
  }

  useEffect(() => { load(); loadStatus() }, [])

  const lastRun = status?.sweepRuns[0] || null

  const runNow = async () => {
    if (running) return
    if (!confirm('Run the Celebrations sweep now? This sends real birthday/anniversary mail to anyone due today who hasn\'t already been mailed this year — it will not re-send to anyone already covered.')) return
    setRunning(true)
    setRunResult(null)
    try {
      const res = await fetch('/api/hr/talent-management/celebrations/run-now', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to run the sweep.')
      setRunResult({ ok: true, message: `Done — ${data.birthdaysSent} birthday mail(s), ${data.anniversariesSent} anniversary mail(s) sent.${data.errors?.length ? ` Errors: ${data.errors.join('; ')}` : ''}` })
      loadStatus()
    } catch (err) {
      setRunResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to run the sweep.' })
    } finally {
      setRunning(false)
    }
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setError('')
    setSaveMessage(null)
    try {
      const res = await fetch('/api/hr/talent-management/celebrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save.')
      setSettings(data)
      setSaveMessage('Saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      icon={PartyPopper}
      title="Celebrations"
      description="Birthday and work-anniversary mail to active Talent Members — sent automatically each morning (one per person per year), with your own sender identity and Cc list."
    >
      <div className="p-5 pt-0 space-y-5">
        {error && <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}

        {status && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-2">
            <div className="flex items-start gap-2 text-[11px]">
              <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              {lastRun ? (
                <span className="text-slate-600">
                  Last automated check: <span className="font-medium text-slate-700">{fmtLagosDateTime(lastRun.ranAt)}</span>
                  {' — '}{lastRun.birthdaysSent} birthday mail(s), {lastRun.anniversariesSent} anniversary mail(s) sent.
                  {lastRun.errors && <span className="text-rose-600"> Errors: {lastRun.errors}</span>}
                  {' '}This runs once a day (~8am WAT) as part of the daily automation sweep — if it hasn&apos;t run yet today, nothing will go out until it does.
                </span>
              ) : (
                <span className="text-slate-500">The daily automation sweep hasn&apos;t run yet since this was added — check back after the next scheduled run (~8am WAT).</span>
              )}
            </div>
            <div className="flex items-center gap-2 pl-5">
              <button
                type="button"
                onClick={runNow}
                disabled={running}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700 text-white text-[11px] font-medium rounded-lg disabled:opacity-50"
              >
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                Run sweep now
              </button>
              <span className="text-[10px] text-slate-400">Catches anyone due today who was missed — safe to click, never re-sends to someone already mailed this year.</span>
            </div>
            {runResult && <p className={`text-[11px] pl-5 ${runResult.ok ? 'text-meristem-700' : 'text-rose-600'}`}>{runResult.message}</p>}
          </div>
        )}

        {status && (
          <div className="flex flex-wrap gap-4">
            <UpcomingList<UpcomingCelebration>
              icon={Cake}
              title="Next 5 birthdays"
              items={status.upcoming.birthdays}
              render={(item) => `${fmtMonthDay(item.month, item.day)} · ${fmtDaysAway(item.daysAway)}`}
            />
            <UpcomingList<UpcomingAnniversary>
              icon={Award}
              title="Next 5 work anniversaries"
              items={status.upcoming.anniversaries}
              render={(item) => `${fmtMonthDay(item.month, item.day)} · ${fmtDaysAway(item.daysAway)} · ${item.years} yr(s)`}
            />
          </div>
        )}

        {status && (
          <div>
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
              <History className="w-3.5 h-3.5 text-slate-400" /> Sent history
            </p>
            {status.sendLog.length === 0 ? (
              <p className="text-[11px] text-slate-400">No celebration mail has gone out yet.</p>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-left text-slate-500">
                      <th className="px-2.5 py-1.5">Name</th>
                      <th className="px-2.5 py-1.5">Type</th>
                      <th className="px-2.5 py-1.5">Year</th>
                      <th className="px-2.5 py-1.5">Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.sendLog.map((entry, i) => (
                      <tr key={`${entry.staffId}-${entry.type}-${entry.year}`} className={i % 2 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="px-2.5 py-1.5 text-slate-700">{entry.staffName}</td>
                        <td className="px-2.5 py-1.5 text-slate-500 capitalize">{entry.type}</td>
                        <td className="px-2.5 py-1.5 text-slate-500">{entry.year}</td>
                        <td className="px-2.5 py-1.5 text-slate-500">{fmtLagosDateTime(entry.sentAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {loading || !settings ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Sender display name</label>
                <input
                  value={settings.senderName}
                  onChange={(e) => setSettings({ ...settings, senderName: e.target.value })}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs w-52"
                  placeholder="Human Resources"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">From address</label>
                <input
                  value={settings.fromAddress ?? ''}
                  onChange={(e) => setSettings({ ...settings, fromAddress: e.target.value })}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs w-56"
                  placeholder="hr@meristemng.com"
                />
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Cc (comma/semicolon-separated, optional)</label>
                <input
                  value={settings.ccEmails ?? ''}
                  onChange={(e) => setSettings({ ...settings, ccEmails: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  placeholder="talentmanagement@meristemng.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Birthday mail</p>
                <PauseToggle enabled={settings.birthdayEnabled} onChange={(next) => setSettings({ ...settings, birthdayEnabled: next })} />
              </div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Subject</label>
              <input
                value={settings.birthdaySubject}
                onChange={(e) => setSettings({ ...settings, birthdaySubject: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs mb-2"
              />
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Body — use <code className="bg-slate-100 px-1 rounded">{'{firstname}'}</code>
              </label>
              <textarea
                value={settings.birthdayBody}
                onChange={(e) => setSettings({ ...settings, birthdayBody: e.target.value })}
                rows={8}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono mb-2"
              />
              <TestSendRow type="birthday" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Work anniversary mail</p>
                <PauseToggle enabled={settings.anniversaryEnabled} onChange={(next) => setSettings({ ...settings, anniversaryEnabled: next })} />
              </div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Subject</label>
              <input
                value={settings.anniversarySubject}
                onChange={(e) => setSettings({ ...settings, anniversarySubject: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs mb-2"
              />
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Body — use <code className="bg-slate-100 px-1 rounded">{'{firstname}'}</code> and <code className="bg-slate-100 px-1 rounded">{'{years}'}</code>
              </label>
              <textarea
                value={settings.anniversaryBody}
                onChange={(e) => setSettings({ ...settings, anniversaryBody: e.target.value })}
                rows={8}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono mb-2"
              />
              <TestSendRow type="anniversary" />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-meristem-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Celebrations settings'}
              </button>
              {saveMessage && <span className="text-[11px] text-meristem-700">{saveMessage}</span>}
            </div>

            <p className="text-[11px] text-slate-400">
              Sent once per person per year, automatically, to every active (non-Exited) Talent Member whose birthday or work
              anniversary falls on the current day — folded into the existing daily automation run, no separate schedule to manage.
            </p>
          </>
        )}
      </div>
    </SectionCard>
  )
}
