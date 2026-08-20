'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link2, Loader2, Plus, ChevronDown, ChevronUp, Trash2, Send, Calendar, Search, X, Download, Upload,
} from 'lucide-react'

interface SettingsState {
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

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  lineManagerStaffId: string | null
}

const STAGE_LABELS: Record<'pre' | 'post1' | 'post2', string> = {
  pre: 'Pre-Training Survey',
  post1: 'Post-1 (Day 1, employee)',
  post2: 'Post-2 (1-Month, manager)',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString()
}

function csvEscape(val: string): string {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`
  return val
}

function parseCSV(text: string): string[] {
  // Accepts either a one-column file or a full export — just pulls every non-empty cell that
  // isn't obviously a header label, so "Staff ID", "Email", or a plain list all work.
  const lines = text.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean)
  const values: string[] = []
  for (const line of lines) {
    const cell = line.split(',')[0].replace(/^"|"$/g, '').trim()
    if (!cell) continue
    if (/^staff ?id$|^email$|^identifier$/i.test(cell)) continue
    values.push(cell)
  }
  return values
}

export function SurveyAutomationPanel() {
  const [settings, setSettings] = useState<SettingsState>({ preSurveyFormUrl: '', post1SurveyFormUrl: '', post2SurveyFormUrl: '' })
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [saved, setSaved] = useState(false)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [newSchedule, setNewSchedule] = useState({ trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '' })
  const [creatingSchedule, setCreatingSchedule] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [roster, setRoster] = useState<RosterStaff[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [pending, setPending] = useState<RosterStaff[]>([])
  const [addingAttendees, setAddingAttendees] = useState(false)
  const [attendeeResult, setAttendeeResult] = useState<{ added: number; notFound: string[]; noEmail: string[] } | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const [sendingKey, setSendingKey] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ key: string; sent: number; skipped: { staffName: string; reason: string }[] } | null>(null)

  const loadSettings = async () => {
    setLoadingSettings(true)
    try {
      const res = await fetch('/api/admin/survey-settings')
      const data = await res.json()
      setSettings({
        preSurveyFormUrl: data.preSurveyFormUrl || '',
        post1SurveyFormUrl: data.post1SurveyFormUrl || '',
        post2SurveyFormUrl: data.post2SurveyFormUrl || '',
      })
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

  const loadRoster = async () => {
    const res = await fetch('/api/admin/roster-directory')
    setRoster(await res.json())
  }

  useEffect(() => {
    loadSettings()
    loadSchedules()
    loadRoster()
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

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const pendingIds = new Set(pending.map((p) => p.staffId))
    return roster
      .filter((r) => !pendingIds.has(r.staffId))
      .filter((r) => r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [searchQuery, roster, pending])

  const addToPending = (staff: RosterStaff) => {
    setPending((prev) => [...prev, staff])
    setSearchQuery('')
  }

  const removeFromPending = (staffId: string) => {
    setPending((prev) => prev.filter((p) => p.staffId !== staffId))
  }

  const submitAttendees = async (scheduleId: string, identifiers: string[]) => {
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
        setPending([])
        await loadSchedules()
      } else {
        alert(data.error || 'Failed to add attendees.')
      }
    } finally {
      setAddingAttendees(false)
    }
  }

  const downloadTemplate = () => {
    const csv = 'Staff ID or Email\n' + [csvEscape('MSL-0123'), csvEscape('someone@meristem.com')].join('\n') + '\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'training_attendees_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCSVUpload = async (scheduleId: string, file: File) => {
    const text = await file.text()
    const identifiers = parseCSV(text)
    if (identifiers.length === 0) {
      alert('No Staff IDs or emails found in that file.')
      return
    }
    await submitAttendees(scheduleId, identifiers)
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
      {/* Google Form links */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <Link2 className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Survey Links</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Pre and Post-1 go to the employee; Post-2 goes to their line manager. SMTP is configured in Admin Settings.
            </p>
          </div>
        </div>

        {loadingSettings ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-4">
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
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saved ? 'Saved' : 'Save Settings'}
            </button>
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
                    onClick={() => { setExpandedId(isExpanded ? null : s.id); setAttendeeResult(null); setPending([]); setSearchQuery('') }}
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

                      {/* Search-select attendee picker */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Add attendees — search by name, email, or Staff ID</label>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Type a name, email, or Staff ID…"
                            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                          />
                          {searchResults.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {searchResults.map((r) => (
                                <button
                                  key={r.staffId}
                                  onClick={() => addToPending(r)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
                                >
                                  <span className="text-slate-700">{r.name}</span>
                                  <span className="text-slate-400">{r.staffId}{r.email ? ` · ${r.email}` : ''}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {pending.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {pending.map((p) => (
                              <span key={p.staffId} className="flex items-center gap-1 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
                                {p.name}
                                <button onClick={() => removeFromPending(p.staffId)} className="hover:text-red-600">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => submitAttendees(s.id, pending.map((p) => p.staffId))}
                            disabled={addingAttendees || pending.length === 0}
                            className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
                          >
                            {addingAttendees && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Add {pending.length > 0 ? `${pending.length} ` : ''}Selected
                          </button>
                          <span className="text-xs text-slate-300">or</span>
                          <button
                            onClick={downloadTemplate}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download CSV Template
                          </button>
                          <button
                            onClick={() => csvInputRef.current?.click()}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Upload CSV
                          </button>
                          <input
                            ref={csvInputRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleCSVUpload(s.id, file)
                              e.target.value = ''
                            }}
                          />
                        </div>

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
                                      {a[f] ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}
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

      <p className="text-xs text-slate-400 px-1">
        A daily automated check also sends Pre (up to a week before start), Post-1 (from a day after end), and Post-2 (from a month after end) to
        anyone who hasn&apos;t received that stage yet — the buttons above are for sending sooner or resending manually.
      </p>
    </div>
  )
}
