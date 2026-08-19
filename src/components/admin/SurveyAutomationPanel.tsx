'use client'

import { useEffect, useState } from 'react'
import {
  Mail, Loader2, CheckCircle2, AlertTriangle, Plus, ChevronDown, ChevronUp, Trash2, Send, Calendar,
} from 'lucide-react'

interface SettingsState {
  fromName: string
  preSurveyFormUrl: string
  post1SurveyFormUrl: string
  post2SurveyFormUrl: string
}

interface Attendee {
  id: string
  staffId: string
  staffName: string
  email: string | null
  lineManagerName: string | null
  lineManagerEmail: string | null
  preSurveySentAt: string | null
  post1SurveySentAt: string | null
  post2SurveySentAt: string | null
}

interface Schedule {
  id: string
  trainingName: string
  businessUnit: string
  startDate: string
  endDate: string
  hours: number | null
  attendeeCount: number
  preSent: number
  post1Sent: number
  post2Sent: number
  attendees: Attendee[]
}

const STAGE_LABELS: Record<'pre' | 'post1' | 'post2', string> = {
  pre: 'Pre-Training Survey',
  post1: 'Post-1 (Day 1, employee)',
  post2: 'Post-2 (1-Month, manager)',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString()
}

export function SurveyAutomationPanel() {
  const [settings, setSettings] = useState<SettingsState>({ fromName: 'Meristem L&D', preSurveyFormUrl: '', post1SurveyFormUrl: '', post2SurveyFormUrl: '' })
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [newSchedule, setNewSchedule] = useState({ trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '' })
  const [creatingSchedule, setCreatingSchedule] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [attendeeInput, setAttendeeInput] = useState('')
  const [addingAttendees, setAddingAttendees] = useState(false)
  const [attendeeResult, setAttendeeResult] = useState<{ added: number; notFound: string[]; noEmail: string[] } | null>(null)
  const [sendingKey, setSendingKey] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ key: string; sent: number; skipped: { staffName: string; reason: string }[] } | null>(null)

  const loadSettings = async () => {
    setLoadingSettings(true)
    try {
      const res = await fetch('/api/admin/survey-settings')
      const data = await res.json()
      setSettings({
        fromName: data.fromName || 'Meristem L&D',
        preSurveyFormUrl: data.preSurveyFormUrl || '',
        post1SurveyFormUrl: data.post1SurveyFormUrl || '',
        post2SurveyFormUrl: data.post2SurveyFormUrl || '',
      })
      setSmtpConfigured(!!data.smtpConfigured)
    } finally {
      setLoadingSettings(false)
    }
  }

  const loadSchedules = async () => {
    setLoadingSchedules(true)
    try {
      const res = await fetch('/api/admin/training-schedule')
      setSchedules(await res.json())
    } finally {
      setLoadingSchedules(false)
    }
  }

  useEffect(() => {
    loadSettings()
    loadSchedules()
  }, [])

  const saveSettings = async () => {
    setSavingSettings(true)
    setSaved(false)
    try {
      await fetch('/api/admin/survey-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSavingSettings(false)
    }
  }

  const sendTestEmail = async () => {
    if (!testEmail.trim()) return
    setSendingTest(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/survey-settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim() }),
      })
      const data = await res.json()
      setTestResult({ success: res.ok, message: res.ok ? `Test email sent to ${testEmail.trim()}.` : data.error || 'Failed to send.' })
    } finally {
      setSendingTest(false)
    }
  }

  const createSchedule = async () => {
    setCreatingSchedule(true)
    try {
      const res = await fetch('/api/admin/training-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSchedule, hours: newSchedule.hours ? Number(newSchedule.hours) : undefined }),
      })
      if (res.ok) {
        setNewSchedule({ trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '' })
        setShowAddSchedule(false)
        await loadSchedules()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to create schedule.')
      }
    } finally {
      setCreatingSchedule(false)
    }
  }

  const deleteSchedule = async (id: string) => {
    if (!confirm('Delete this training schedule and all its attendees? This cannot be undone.')) return
    await fetch(`/api/admin/training-schedule/${id}`, { method: 'DELETE' })
    await loadSchedules()
  }

  const addAttendees = async (scheduleId: string) => {
    const identifiers = attendeeInput.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    if (identifiers.length === 0) return
    setAddingAttendees(true)
    setAttendeeResult(null)
    try {
      const res = await fetch(`/api/admin/training-schedule/${scheduleId}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers }),
      })
      const data = await res.json()
      if (res.ok) {
        setAttendeeResult(data)
        setAttendeeInput('')
        await loadSchedules()
      } else {
        alert(data.error || 'Failed to add attendees.')
      }
    } finally {
      setAddingAttendees(false)
    }
  }

  const removeAttendee = async (scheduleId: string, attendeeId: string) => {
    await fetch(`/api/admin/training-schedule/${scheduleId}/attendees/${attendeeId}`, { method: 'DELETE' })
    await loadSchedules()
  }

  const sendStage = async (scheduleId: string, stage: 'pre' | 'post1' | 'post2', attendeeIds?: string[]) => {
    const key = `${scheduleId}:${stage}:${attendeeIds?.join(',') || 'all'}`
    if (!confirm(`Send the ${STAGE_LABELS[stage]} email now?`)) return
    setSendingKey(key)
    setSendResult(null)
    try {
      const res = await fetch(`/api/admin/training-schedule/${scheduleId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, attendeeIds }),
      })
      const data = await res.json()
      if (res.ok) {
        setSendResult({ key, sent: data.sent, skipped: data.skipped })
        await loadSchedules()
      } else {
        alert(data.error || 'Failed to send.')
      }
    } finally {
      setSendingKey(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* SMTP + form links */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <Mail className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Email &amp; Survey Links</p>
            <p className="text-xs text-slate-500 mt-0.5">
              SMTP credentials live in environment variables (never here). Pre and Post-1 go to the employee; Post-2 goes to their line manager.
            </p>
          </div>
        </div>

        {loadingSettings ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-4">
            {smtpConfigured === false && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                No SMTP server configured yet. Ask your developer to set <code className="mx-1 bg-amber-100 px-1 rounded">SMTP_HOST</code>,
                <code className="mx-1 bg-amber-100 px-1 rounded">SMTP_PORT</code>, <code className="mx-1 bg-amber-100 px-1 rounded">SMTP_USER</code> and
                <code className="mx-1 bg-amber-100 px-1 rounded">SMTP_PASS</code> in environment variables, then redeploy.
              </div>
            )}
            {smtpConfigured && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                SMTP is configured on the server.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Sender display name</label>
              <input
                value={settings.fromName}
                onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Pre-Training Form link</label>
                <input
                  value={settings.preSurveyFormUrl}
                  onChange={(e) => setSettings({ ...settings, preSurveyFormUrl: e.target.value })}
                  placeholder="https://forms.gle/…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Post-1 Form link (employee)</label>
                <input
                  value={settings.post1SurveyFormUrl}
                  onChange={(e) => setSettings({ ...settings, post1SurveyFormUrl: e.target.value })}
                  placeholder="https://forms.gle/…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Post-2 Form link (manager)</label>
                <input
                  value={settings.post2SurveyFormUrl}
                  onChange={(e) => setSettings({ ...settings, post2SurveyFormUrl: e.target.value })}
                  placeholder="https://forms.gle/…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
              >
                {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {saved ? 'Saved' : 'Save Settings'}
              </button>
              <input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@meristem.com"
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48"
              />
              <button
                onClick={sendTestEmail}
                disabled={sendingTest || !testEmail.trim()}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
              >
                {sendingTest && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Send Test Email
              </button>
            </div>
            {testResult && (
              <p className={`text-xs ${testResult.success ? 'text-emerald-700' : 'text-red-600'}`}>{testResult.message}</p>
            )}
          </div>
        )}
      </div>

      {/* Training schedules */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Training Schedules</p>
              <p className="text-xs text-slate-500 mt-0.5">Add an upcoming training, its attendees, and trigger survey emails — manually or in bulk.</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddSchedule((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Schedule
          </button>
        </div>

        {showAddSchedule && (
          <div className="mb-5 border border-dashed border-slate-300 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="Training name"
                value={newSchedule.trainingName}
                onChange={(e) => setNewSchedule({ ...newSchedule, trainingName: e.target.value })}
                className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              />
              <input
                placeholder="Business Unit"
                value={newSchedule.businessUnit}
                onChange={(e) => setNewSchedule({ ...newSchedule, businessUnit: e.target.value })}
                className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs text-slate-500">
                Start date
                <input
                  type="date"
                  value={newSchedule.startDate}
                  onChange={(e) => setNewSchedule({ ...newSchedule, startDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                />
              </label>
              <label className="text-xs text-slate-500">
                End date
                <input
                  type="date"
                  value={newSchedule.endDate}
                  onChange={(e) => setNewSchedule({ ...newSchedule, endDate: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                />
              </label>
              <label className="text-xs text-slate-500">
                Hours
                <input
                  type="number"
                  value={newSchedule.hours}
                  onChange={(e) => setNewSchedule({ ...newSchedule, hours: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                />
              </label>
            </div>
            <button
              onClick={createSchedule}
              disabled={creatingSchedule || !newSchedule.trainingName || !newSchedule.businessUnit || !newSchedule.startDate || !newSchedule.endDate}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {creatingSchedule && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Schedule
            </button>
          </div>
        )}

        {loadingSchedules ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : schedules.length === 0 ? (
          <p className="text-xs text-slate-400">No training schedules yet.</p>
        ) : (
          <div className="space-y-2">
            {schedules.map((s) => {
              const isExpanded = expandedId === s.id
              return (
                <div key={s.id} className="border border-slate-200 rounded-lg">
                  <button
                    onClick={() => { setExpandedId(isExpanded ? null : s.id); setAttendeeResult(null) }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.trainingName}</p>
                      <p className="text-xs text-slate-500">
                        {s.businessUnit} · {fmtDate(s.startDate)}–{fmtDate(s.endDate)} · {s.hours ? `${s.hours}h` : 'no hours set'} · {s.attendeeCount} attendee{s.attendeeCount === 1 ? '' : 's'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Pre: {s.preSent}/{s.attendeeCount} · Post-1: {s.post1Sent}/{s.attendeeCount} · Post-2: {s.post2Sent}/{s.attendeeCount}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-4">
                      {/* Bulk send buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {(['pre', 'post1', 'post2'] as const).map((stage) => {
                          const key = `${s.id}:${stage}:all`
                          return (
                            <button
                              key={stage}
                              onClick={() => sendStage(s.id, stage)}
                              disabled={sendingKey === key || s.attendeeCount === 0}
                              className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 disabled:opacity-50"
                            >
                              {sendingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                              Send {STAGE_LABELS[stage]} to all
                            </button>
                          )
                        })}
                        <button
                          onClick={() => deleteSchedule(s.id)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete schedule
                        </button>
                      </div>
                      {sendResult && sendResult.key.startsWith(`${s.id}:`) && (
                        <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
                          <p className="text-emerald-700">{sendResult.sent} email{sendResult.sent === 1 ? '' : 's'} sent.</p>
                          {sendResult.skipped.length > 0 && (
                            <div className="text-amber-700">
                              {sendResult.skipped.map((sk, i) => (
                                <p key={i}>{sk.staffName}: {sk.reason}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Add attendees */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">
                          Add attendees — one Staff ID or email per line
                        </label>
                        <textarea
                          value={attendeeInput}
                          onChange={(e) => setAttendeeInput(e.target.value)}
                          rows={3}
                          placeholder={'MSL-0123\nMSL-0456\nsomeone@meristem.com'}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                        />
                        <button
                          onClick={() => addAttendees(s.id)}
                          disabled={addingAttendees || !attendeeInput.trim()}
                          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
                        >
                          {addingAttendees && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Add Attendees
                        </button>
                        {attendeeResult && (
                          <div className="mt-2 text-xs space-y-0.5">
                            <p className="text-emerald-700">{attendeeResult.added} added.</p>
                            {attendeeResult.notFound.length > 0 && (
                              <p className="text-red-600">Not found in roster: {attendeeResult.notFound.join(', ')}</p>
                            )}
                            {attendeeResult.noEmail.length > 0 && (
                              <p className="text-amber-700">No email on file (won&apos;t receive employee-directed surveys): {attendeeResult.noEmail.join(', ')}</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Attendee list */}
                      {s.attendees.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-400 border-b border-slate-100">
                                <th className="text-left font-medium py-1.5 pr-3">Name</th>
                                <th className="text-left font-medium py-1.5 pr-3">Email</th>
                                <th className="text-left font-medium py-1.5 pr-3">Line Manager</th>
                                <th className="text-center font-medium py-1.5 pr-3">Pre</th>
                                <th className="text-center font-medium py-1.5 pr-3">Post-1</th>
                                <th className="text-center font-medium py-1.5 pr-3">Post-2</th>
                                <th className="py-1.5"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.attendees.map((a) => (
                                <tr key={a.id} className="border-b border-slate-50">
                                  <td className="py-1.5 pr-3 text-slate-700">{a.staffName}</td>
                                  <td className="py-1.5 pr-3 text-slate-500">{a.email || '—'}</td>
                                  <td className="py-1.5 pr-3 text-slate-500">{a.lineManagerName || '—'}</td>
                                  {(['preSurveySentAt', 'post1SurveySentAt', 'post2SurveySentAt'] as const).map((f) => (
                                    <td key={f} className="py-1.5 pr-3 text-center">
                                      {a[f] ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" /> : <span className="text-slate-300">—</span>}
                                    </td>
                                  ))}
                                  <td className="py-1.5 text-right">
                                    <button onClick={() => removeAttendee(s.id, a.id)} className="text-slate-300 hover:text-red-600">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-400 rounded-lg px-1">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Automatic date-based triggering (send Pre a week before, Post-1 a day after, Post-2 a month after — without a manual click) isn&apos;t built yet.
          For now, use the &quot;Send … to all&quot; buttons above manually or in bulk.
        </p>
      </div>
    </div>
  )
}
