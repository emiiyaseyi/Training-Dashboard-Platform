'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link2, Loader2, Plus, ChevronDown, ChevronUp, Trash2, Send, Calendar, Search, X, Download, Upload, RefreshCw, PenLine,
} from 'lucide-react'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { SectionCard } from '@/components/ui/SectionCard'

const SCHEDULE_PAGE_SIZE = 10
const ATTENDEE_PAGE_SIZE = 15

interface SettingsState {
  post1MirrorSheetName: string
  post2MirrorSheetName: string
  preMirrorSheetName: string
  preDaysBefore: number
  post1DaysAfter: number
  post2DaysAfter: number
  expiryEnabled: boolean
  expiryDays: number
  maxFileUploadMB: number
  excludeDefaultCcOnReminders: boolean
}

interface Attendee {
  id: string
  staffId: string
  staffName: string
  email: string | null
  lineManagerName: string | null
  lineManagerEmail: string | null
  additionalCc: string | null
  preSurveySentAt: string | null
  post1SurveySentAt: string | null
  post2SurveySentAt: string | null
  preSurveyRespondedAt: string | null
  post1SurveyRespondedAt: string | null
  post2SurveyRespondedAt: string | null
}

interface Schedule {
  id: string
  trainingName: string
  businessUnit: string
  startDate: string
  endDate: string
  hours: number | null
  costPerAttendee: number | null
  trainingType: string | null
  capability: string | null
  vendor: string | null
  remindersEnabled: boolean
  preEnabled: boolean
  post1Enabled: boolean
  post2Enabled: boolean
  additionalCc: string | null
  additionalCcMode: string
  sourcedFromHistoricalData: boolean
  trainingMode: string
  location: string | null
  meetingLink: string | null
  attendeeCount: number
  preSent: number
  post1Sent: number
  post2Sent: number
  preFilled: number
  post1Filled: number
  post2Filled: number
  attendees: Attendee[]
}

type TickState = 'unsent' | 'sent' | 'filled' | 'expired'

function tickState(sentAt: string | null, respondedAt: string | null, expiryEnabled: boolean, expiryDays: number): TickState {
  if (!sentAt) return 'unsent'
  if (respondedAt) return 'filled'
  if (expiryEnabled && Date.now() - new Date(sentAt).getTime() >= expiryDays * 86400000) return 'expired'
  return 'sent'
}

const TICK_STYLE: Record<TickState, string> = {
  unsent: 'text-slate-300',
  sent: 'text-emerald-600',
  filled: 'text-blue-600',
  expired: 'text-red-600',
}
const TICK_SYMBOL: Record<TickState, string> = { unsent: '—', sent: '✓', filled: '✓', expired: '✕' }

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  lineManagerStaffId: string | null
  businessUnit: string
}

interface BusinessUnitOption {
  id: string
  name: string
}

interface NamedOption {
  id: string
  name: string
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
  const [settings, setSettings] = useState<SettingsState>({
    post1MirrorSheetName: '', post2MirrorSheetName: '', preMirrorSheetName: '',
    preDaysBefore: 7, post1DaysAfter: 1, post2DaysAfter: 30,
    expiryEnabled: true, expiryDays: 7, maxFileUploadMB: 20,
    excludeDefaultCcOnReminders: true,
  })
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [saved, setSaved] = useState(false)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [newSchedule, setNewSchedule] = useState({
    trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '',
    costPerAttendee: '', trainingType: '', capability: '', vendor: '',
    preEnabled: true, post1Enabled: true, post2Enabled: true, additionalCc: '', additionalCcMode: 'all' as 'all' | 'individual', isHistorical: false,
    trainingMode: 'physical' as 'physical' | 'virtual' | 'platform', location: '', meetingLink: '',
  })
  const [trainingTypes, setTrainingTypes] = useState<NamedOption[]>([])
  const [capabilities, setCapabilities] = useState<NamedOption[]>([])
  const [vendors, setVendors] = useState<NamedOption[]>([])
  const [creatingSchedule, setCreatingSchedule] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [schedulePage, setSchedulePage] = useState(1)
  const [scheduleQuery, setScheduleQuery] = useState('')
  // Already Attended Trainings creates its own schedule row purely to track Post-1/Post-2
  // send/response status — it never touches Training Data or the Google Sheet mirror (see the
  // `!schedule.sourcedFromHistoricalData` guard in training-schedule/[id]/attendees/route.ts).
  // Kept out of the default "Active Schedules" view below so it doesn't read as a real, forward
  // scheduled training — switch tabs to see and manage it.
  const [scheduleView, setScheduleView] = useState<'active' | 'historical'>('active')
  const [attendeeTableQuery, setAttendeeTableQuery] = useState('')
  const [attendeePage, setAttendeePage] = useState(1)

  const [roster, setRoster] = useState<RosterStaff[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [pending, setPending] = useState<RosterStaff[]>([])
  const [addingAttendees, setAddingAttendees] = useState(false)
  const [attendeeResult, setAttendeeResult] = useState<{ added: number; notFound: string[]; noEmail: string[] } | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // Attendees picked before the schedule even exists yet — added right after creation succeeds.
  const [newScheduleSearchQuery, setNewScheduleSearchQuery] = useState('')
  const [newSchedulePending, setNewSchedulePending] = useState<RosterStaff[]>([])

  const [sendingKey, setSendingKey] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ key: string; sent: number; skipped: { staffName: string; reason: string }[] } | null>(null)

  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [refreshResult, setRefreshResult] = useState<{ scheduleId: string; updated: number; total: number; stillMissing: string[] } | null>(null)

  // Per-attendee "Additional Cc" edits (only relevant when a schedule's additionalCcMode is
  // "individual") — a local draft per attendee id so typing doesn't fight the list re-render on
  // every keystroke; saved on blur.
  const [ccDrafts, setCcDrafts] = useState<Record<string, string>>({})
  const [savingCcId, setSavingCcId] = useState<string | null>(null)
  const saveAttendeeCc = async (scheduleId: string, attendeeId: string, value: string) => {
    setSavingCcId(attendeeId)
    try {
      await fetch(`/api/admin/training-schedule/${scheduleId}/attendees/${attendeeId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ additionalCc: value }),
      })
      await loadSchedules()
    } finally {
      setSavingCcId(null)
    }
  }

  const loadSettings = async () => {
    setLoadingSettings(true)
    try {
      const res = await fetch('/api/admin/survey-settings')
      const data = await res.json()
      setSettings({
        post1MirrorSheetName: data.post1MirrorSheetName || '',
        post2MirrorSheetName: data.post2MirrorSheetName || '',
        preMirrorSheetName: data.preMirrorSheetName || '',
        preDaysBefore: data.preDaysBefore ?? 7,
        post1DaysAfter: data.post1DaysAfter ?? 1,
        post2DaysAfter: data.post2DaysAfter ?? 30,
        expiryEnabled: data.expiryEnabled ?? true,
        expiryDays: data.expiryDays ?? 7,
        maxFileUploadMB: data.maxFileUploadMB ?? 20,
        excludeDefaultCcOnReminders: data.excludeDefaultCcOnReminders ?? true,
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

  const loadBusinessUnits = async () => {
    const res = await fetch('/api/business-units')
    const data = await res.json()
    setBusinessUnits(Array.isArray(data) ? data : [])
  }

  const loadTaxonomies = async () => {
    const [typesRes, capsRes, vendorsRes] = await Promise.all([fetch('/api/training-types'), fetch('/api/capabilities'), fetch('/api/vendors')])
    setTrainingTypes(await typesRes.json())
    setCapabilities(await capsRes.json())
    setVendors(await vendorsRes.json())
  }

  useEffect(() => {
    loadSettings()
    loadSchedules()
    loadRoster()
    loadBusinessUnits()
    loadTaxonomies()
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

  const resetScheduleForm = () => {
    setNewSchedule({
      trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '', costPerAttendee: '', trainingType: '', capability: '', vendor: '',
      preEnabled: true, post1Enabled: true, post2Enabled: true, additionalCc: '', additionalCcMode: 'all' as 'all' | 'individual', isHistorical: false,
      trainingMode: 'physical' as 'physical' | 'virtual' | 'platform', location: '', meetingLink: '',
    })
    setNewSchedulePending([])
    setNewScheduleSearchQuery('')
    setEditingScheduleId(null)
    setShowAddSchedule(false)
  }

  const startEditSchedule = (s: Schedule) => {
    setNewSchedule({
      trainingName: s.trainingName,
      businessUnit: s.businessUnit,
      startDate: s.startDate.slice(0, 10),
      endDate: s.endDate.slice(0, 10),
      hours: s.hours?.toString() ?? '',
      costPerAttendee: s.costPerAttendee?.toString() ?? '',
      trainingType: s.trainingType ?? '',
      capability: s.capability ?? '',
      vendor: s.vendor ?? '',
      preEnabled: s.preEnabled,
      post1Enabled: s.post1Enabled,
      post2Enabled: s.post2Enabled,
      additionalCc: s.additionalCc ?? '',
      additionalCcMode: (s.additionalCcMode === 'individual' ? 'individual' : 'all') as 'all' | 'individual',
      isHistorical: s.sourcedFromHistoricalData,
      trainingMode: (['physical', 'virtual', 'platform'].includes(s.trainingMode) ? s.trainingMode : 'physical') as 'physical' | 'virtual' | 'platform',
      location: s.location ?? '',
      meetingLink: s.meetingLink ?? '',
    })
    setEditingScheduleId(s.id)
    setShowAddSchedule(true)
  }

  const saveSchedule = async () => {
    setCreatingSchedule(true)
    try {
      const res = await fetch(
        editingScheduleId ? `/api/admin/training-schedule/${editingScheduleId}` : '/api/admin/training-schedule',
        {
          method: editingScheduleId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newSchedule,
            isHistorical: undefined, // local UI flag only (hides the Pre-Training checkbox when editing an already-historical schedule) — not a field the API accepts
            hours: newSchedule.hours ? Number(newSchedule.hours) : undefined,
            costPerAttendee: newSchedule.costPerAttendee ? Number(newSchedule.costPerAttendee) : undefined,
          }),
        }
      )
      if (res.ok) {
        const saved = await res.json()
        if (!editingScheduleId && newSchedulePending.length > 0) {
          await fetch(`/api/admin/training-schedule/${saved.id}/attendees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifiers: newSchedulePending.map((p) => p.staffId) }),
          })

          // A schedule entered for a training that's already due for a stage right now (same exact
          // windows the daily cron itself checks) shouldn't have to wait for tomorrow's tick to
          // catch up — send it immediately instead. A stage that isn't due yet is untouched here;
          // the cron picks it up once it actually becomes due, exactly as normal.
          const daysUntilStart = (new Date(newSchedule.startDate).getTime() - Date.now()) / 86400000
          const daysSinceEnd = (Date.now() - new Date(newSchedule.endDate).getTime()) / 86400000
          if (newSchedule.preEnabled && daysUntilStart <= settings.preDaysBefore && daysUntilStart >= -3) {
            await fetch(`/api/admin/training-schedule/${saved.id}/send`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'pre' }),
            }).catch(() => {})
          }
          if (newSchedule.post1Enabled && daysSinceEnd >= settings.post1DaysAfter) {
            await fetch(`/api/admin/training-schedule/${saved.id}/send`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'post1' }),
            }).catch(() => {})
          }
          if (newSchedule.post2Enabled && daysSinceEnd >= settings.post2DaysAfter) {
            await fetch(`/api/admin/training-schedule/${saved.id}/send`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'post2' }),
            }).catch(() => {})
          }
        }
        resetScheduleForm()
        await loadSchedules()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || `Failed to ${editingScheduleId ? 'update' : 'create'} schedule.`)
      }
    } finally {
      setCreatingSchedule(false)
    }
  }

  const newScheduleSearchResults = useMemo(() => {
    const q = newScheduleSearchQuery.trim().toLowerCase()
    if (!q) return []
    const pendingIds = new Set(newSchedulePending.map((p) => p.staffId))
    return roster
      .filter((r) => !pendingIds.has(r.staffId))
      .filter((r) => r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [newScheduleSearchQuery, roster, newSchedulePending])

  const addToNewSchedulePending = (staff: RosterStaff) => {
    setNewSchedulePending((prev) => [...prev, staff])
    setNewScheduleSearchQuery('')
    // First staff picked sets the schedule's Business Unit automatically — still editable via the
    // dropdown below in case a training intentionally spans multiple BUs.
    setNewSchedule((prev) => (prev.businessUnit ? prev : { ...prev, businessUnit: staff.businessUnit }))
  }

  const removeFromNewSchedulePending = (staffId: string) => {
    setNewSchedulePending((prev) => prev.filter((p) => p.staffId !== staffId))
  }

  const deleteSchedule = async (id: string) => {
    if (!confirm('Delete this training schedule and all its attendees? This cannot be undone.')) return
    await fetch(`/api/admin/training-schedule/${id}`, { method: 'DELETE' })
    await loadSchedules()
  }

  const toggleReminders = async (s: Schedule) => {
    await fetch(`/api/admin/training-schedule/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trainingName: s.trainingName, businessUnit: s.businessUnit,
        startDate: s.startDate, endDate: s.endDate, hours: s.hours ?? undefined,
        costPerAttendee: s.costPerAttendee ?? undefined, trainingType: s.trainingType ?? '',
        capability: s.capability ?? '', vendor: s.vendor ?? '',
        remindersEnabled: !s.remindersEnabled,
      }),
    })
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
    const confirmMsg = attendeeIds
      ? `Send the ${STAGE_LABELS[stage]} email now?`
      : `Send the ${STAGE_LABELS[stage]} email to everyone who hasn't already responded? (Anyone who already filled it out won't be re-sent.)`
    if (!confirm(confirmMsg)) return
    setSendingKey(key)
    setSendResult(null)
    try {
      const res = await fetch(`/api/admin/training-schedule/${scheduleId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, attendeeIds }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        setSendResult({ key, sent: data.sent, skipped: data.skipped })
        await loadSchedules()
      } else {
        alert(data?.error || `Failed to send (server returned ${res.status}). Check Survey Send Log below for whatever went out before the failure.`)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send — check your connection and try again.')
    } finally {
      setSendingKey(null)
    }
  }

  const refreshAttendees = async (scheduleId: string) => {
    setRefreshingId(scheduleId)
    setRefreshResult(null)
    try {
      const res = await fetch(`/api/admin/training-schedule/${scheduleId}/attendees/refresh`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setRefreshResult({ scheduleId, ...data })
        await loadSchedules()
      } else {
        alert(data.error || 'Failed to refresh attendees.')
      }
    } finally {
      setRefreshingId(null)
    }
  }

  const viewSchedules = schedules.filter((s) => s.sourcedFromHistoricalData === (scheduleView === 'historical'))
  const filteredSchedules = viewSchedules.filter((s) => {
    const sq = scheduleQuery.trim().toLowerCase()
    return !sq || s.trainingName.toLowerCase().includes(sq) || s.businessUnit.toLowerCase().includes(sq)
  })
  const historicalCount = schedules.filter((s) => s.sourcedFromHistoricalData).length
  const activeCount = schedules.length - historicalCount

  return (
    <div className="space-y-6">
      {/* Survey forms are native to the platform — no Google Form links needed. Submissions
          write to the database and optionally mirror into a tab on the spreadsheet already
          configured under Live Data Source. */}
      <SectionCard
        icon={Link2}
        title="Survey Mirror Sheets"
        description="Forms are hosted in the platform — every submission is saved here. Set a tab name below to also mirror a copy into that tab (in the spreadsheet configured under Live Data Source). Leave blank to skip mirroring for that stage. Pre and Post-1 are filled by the employee; Post-2 by their line manager."
      >
        {loadingSettings ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Pre-Training mirror tab name</label>
                <input
                  value={settings.preMirrorSheetName}
                  onChange={(e) => setSettings({ ...settings, preMirrorSheetName: e.target.value })}
                  placeholder="2026 Pre Training"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Post-1 mirror tab name</label>
                <input
                  value={settings.post1MirrorSheetName}
                  onChange={(e) => setSettings({ ...settings, post1MirrorSheetName: e.target.value })}
                  placeholder="2026 Post Training 1"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Post-2 mirror tab name</label>
                <input
                  value={settings.post2MirrorSheetName}
                  onChange={(e) => setSettings({ ...settings, post2MirrorSheetName: e.target.value })}
                  placeholder="2026 Post Training 2"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Send Timing</p>
              <p className="text-[11px] text-slate-400 mb-2">
                The daily automated check uses these to decide when each stage is due. Manual &quot;Send to all&quot; buttons ignore timing entirely.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-xs text-slate-500">
                  Pre-Training — days before start
                  <input
                    type="number"
                    min={0}
                    value={settings.preDaysBefore}
                    onChange={(e) => setSettings({ ...settings, preDaysBefore: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Post-1 — days after end
                  <input
                    type="number"
                    min={0}
                    value={settings.post1DaysAfter}
                    onChange={(e) => setSettings({ ...settings, post1DaysAfter: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Post-2 — days after end
                  <input
                    type="number"
                    min={0}
                    value={settings.post2DaysAfter}
                    onChange={(e) => setSettings({ ...settings, post2DaysAfter: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                  />
                </label>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Reminders</p>
              <p className="text-[11px] text-slate-400 mb-2">
                A nudge every day the scheduled sweep runs, for anyone already sent a stage who hasn&apos;t responded yet — not a fixed hour count, so it can&apos;t miss a day depending on what time the original survey went out. Stops once they respond or (if enabled) the survey expires. Reminders can also be turned off per training schedule.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-slate-500 flex flex-col">
                  <span className="flex items-center gap-1.5 h-[18px]">
                    <input
                      type="checkbox"
                      checked={settings.expiryEnabled}
                      onChange={(e) => setSettings({ ...settings, expiryEnabled: e.target.checked })}
                    />
                    Expire unfilled surveys after (days)
                  </span>
                  <input
                    type="number"
                    min={1}
                    disabled={!settings.expiryEnabled}
                    value={settings.expiryDays}
                    onChange={(e) => setSettings({ ...settings, expiryDays: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1 disabled:opacity-50"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 mt-3">
                <input
                  type="checkbox"
                  checked={settings.excludeDefaultCcOnReminders}
                  onChange={(e) => setSettings({ ...settings, excludeDefaultCcOnReminders: e.target.checked })}
                />
                Exclude the platform-wide Default Cc from reminder emails (on by default — the original send still includes it; only the daily nudge skips it, so it doesn&apos;t clog inboxes)
              </label>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">File Uploads</p>
              <p className="text-[11px] text-slate-400 mb-2">
                Per-file size limit for &quot;file&quot; type questions (e.g. Learning Resources/Materials, Certification Issued).
              </p>
              <select
                value={settings.maxFileUploadMB}
                onChange={(e) => setSettings({ ...settings, maxFileUploadMB: Number(e.target.value) })}
                className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              >
                {[5, 10, 20, 50, 100].map((mb) => <option key={mb} value={mb}>{mb} MB</option>)}
              </select>
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
      </SectionCard>

      {/* Training schedules */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-800">{scheduleView === 'historical' ? 'Already Attended Trainings — Sent' : 'Training Schedules'}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {scheduleView === 'historical'
                  ? 'Post-1/Post-2 sends created from Already Attended Trainings, for training that happened before the platform tracked it — send/response status only, no writes to Training Data or the Google Sheet.'
                  : 'Add an upcoming training, its attendees, and trigger survey emails — manually or in bulk.'}
              </p>
            </div>
          </div>
          {scheduleView === 'active' && (
            <button
              onClick={() => (showAddSchedule ? resetScheduleForm() : setShowAddSchedule(true))}
              className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Schedule
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-4">
          <button
            onClick={() => { setScheduleView('active'); setSchedulePage(1) }}
            className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${scheduleView === 'active' ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Active Schedules ({activeCount})
          </button>
          <button
            onClick={() => { setScheduleView('historical'); setSchedulePage(1) }}
            className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${scheduleView === 'historical' ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            Already Attended Trainings — Sent ({historicalCount})
          </button>
        </div>

        {viewSchedules.length > 0 && (
          <div className="mb-5 overflow-x-auto">
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="text-left font-medium py-2 px-3">Stage</th>
                  <th className="text-center font-medium py-2 px-3">Sent</th>
                  <th className="text-center font-medium py-2 px-3">Filled</th>
                  <th className="text-center font-medium py-2 px-3">Yet to Fill</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ['pre', 'Pre-Training', 'preSent', 'preFilled'],
                  ['post1', 'Post-1', 'post1Sent', 'post1Filled'],
                  ['post2', 'Post-2', 'post2Sent', 'post2Filled'],
                ] as const).map(([key, label, sentKey, filledKey]) => {
                  const sent = viewSchedules.reduce((sum, s) => sum + s[sentKey], 0)
                  const filled = viewSchedules.reduce((sum, s) => sum + s[filledKey], 0)
                  return (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="py-2 px-3 text-slate-700">{label}</td>
                      <td className="py-2 px-3 text-center text-emerald-700">{sent}</td>
                      <td className="py-2 px-3 text-center text-blue-700">{filled}</td>
                      <td className="py-2 px-3 text-center text-amber-700">{sent - filled}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {showAddSchedule && (
          <div className="mb-5 border border-dashed border-slate-300 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="Training name"
                value={newSchedule.trainingName}
                onChange={(e) => setNewSchedule({ ...newSchedule, trainingName: e.target.value })}
                className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              />
              <select
                value={newSchedule.businessUnit}
                onChange={(e) => setNewSchedule({ ...newSchedule, businessUnit: e.target.value })}
                className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              >
                <option value="">Business Unit — auto-fills once you add an attendee below</option>
                {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
              </select>
            </div>

            {editingScheduleId ? (
              <p className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Attendees are managed from the schedule&rsquo;s own row below (expand it to add/remove people) — this form only edits the schedule&rsquo;s own details.
              </p>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Attendees — search by name, email, or Staff ID (add as many as are going)
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={newScheduleSearchQuery}
                    onChange={(e) => setNewScheduleSearchQuery(e.target.value)}
                    placeholder="Type a name, email, or Staff ID…"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  {newScheduleSearchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {newScheduleSearchResults.map((r) => (
                        <button
                          key={r.staffId}
                          type="button"
                          onClick={() => addToNewSchedulePending(r)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
                        >
                          <span className="text-slate-700">{r.name}</span>
                          <span className="text-slate-400">{r.staffId}{r.businessUnit ? ` · ${r.businessUnit}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {newSchedulePending.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {newSchedulePending.map((p) => (
                      <span key={p.staffId} className="flex items-center gap-1 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
                        {p.name}
                        <button type="button" onClick={() => removeFromNewSchedulePending(p.staffId)} className="hover:text-red-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs text-slate-500">
                Cost per attendee
                <input
                  type="number"
                  value={newSchedule.costPerAttendee}
                  onChange={(e) => setNewSchedule({ ...newSchedule, costPerAttendee: e.target.value })}
                  placeholder="Applied to every attendee's row"
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                />
              </label>
              <label className="text-xs text-slate-500">
                Training Type
                <select
                  value={newSchedule.trainingType}
                  onChange={(e) => setNewSchedule({ ...newSchedule, trainingType: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                >
                  <option value="">Select…</option>
                  {trainingTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Differentiating Capability
                <select
                  value={newSchedule.capability}
                  onChange={(e) => setNewSchedule({ ...newSchedule, capability: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                >
                  <option value="">Select…</option>
                  {capabilities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Vendor
                <select
                  value={newSchedule.vendor}
                  onChange={(e) => setNewSchedule({ ...newSchedule, vendor: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                >
                  <option value="">Select…</option>
                  {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-slate-400">
              Cost, type, and capability feed the Training Data sheet (Admin → Live Data Source → Training Cost tab) for every attendee added.
              Vendor is used by the Talent Members report (Admin → Vendors manages this list). All are set once here and apply to the whole schedule.
            </p>
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Where</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {([
                  ['physical', 'Physical'],
                  ['virtual', 'Virtual'],
                  ['platform', 'Learning Platform'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setNewSchedule({ ...newSchedule, trainingMode: value })}
                    className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
                      newSchedule.trainingMode === value ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {newSchedule.trainingMode === 'physical' ? (
                <input
                  value={newSchedule.location}
                  onChange={(e) => setNewSchedule({ ...newSchedule, location: e.target.value })}
                  placeholder="Venue address"
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                />
              ) : (
                <input
                  value={newSchedule.meetingLink}
                  onChange={(e) => setNewSchedule({ ...newSchedule, meetingLink: e.target.value })}
                  placeholder={newSchedule.trainingMode === 'virtual' ? 'Meeting link (Zoom, Teams, etc.)' : 'Learning platform link'}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                />
              )}
              <p className="text-[11px] text-slate-400 mt-1">Included in the Pre-Training email so attendees know where to go.</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Surveys to send</p>
              <div className="flex flex-wrap items-center gap-4">
                {([
                  ...(newSchedule.isHistorical ? [] : [['preEnabled', 'Pre-Training']] as const),
                  ['post1Enabled', 'Post-1'],
                  ['post2Enabled', 'Post-2'],
                ] as const).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={newSchedule[field]}
                      onChange={(e) => setNewSchedule({ ...newSchedule, [field]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                All three are on by default. Uncheck any stage to disable it entirely for this schedule — it will never be sent, initially or as a reminder.
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 mb-1.5">Additional Cc (optional)</p>
              <div className="flex flex-wrap items-center gap-4 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="radio"
                    checked={newSchedule.additionalCcMode === 'all'}
                    onChange={() => setNewSchedule({ ...newSchedule, additionalCcMode: 'all' })}
                  />
                  Same for every participant
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="radio"
                    checked={newSchedule.additionalCcMode === 'individual'}
                    onChange={() => setNewSchedule({ ...newSchedule, additionalCcMode: 'individual' })}
                  />
                  Different per participant
                </label>
              </div>
              {newSchedule.additionalCcMode === 'all' ? (
                <input
                  value={newSchedule.additionalCc}
                  onChange={(e) => setNewSchedule({ ...newSchedule, additionalCc: e.target.value })}
                  placeholder="e.g. hr@meristemng.com, someone@meristemng.com"
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                />
              ) : (
                <p className="text-[11px] text-slate-400">
                  Set per attendee from the attendee list below (after creating/saving the schedule). Anyone left blank still gets
                  the platform-wide default Cc (Admin → SMTP Settings), just no extra addresses of their own.
                </p>
              )}
              <p className="text-[11px] text-slate-400 mt-1">
                Added on top of the automatic line-manager Cc and the platform-wide default Cc — never replaces either.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={saveSchedule}
                disabled={creatingSchedule || !newSchedule.trainingName || !newSchedule.businessUnit || !newSchedule.startDate || !newSchedule.endDate}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
              >
                {creatingSchedule && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingScheduleId ? 'Save Changes' : 'Create Schedule'}
              </button>
              {editingScheduleId && (
                <button onClick={resetScheduleForm} className="text-xs text-slate-500 hover:text-slate-700">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {loadingSchedules ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : viewSchedules.length === 0 ? (
          <p className="text-xs text-slate-400">{scheduleView === 'historical' ? 'No Already Attended Trainings sends yet.' : 'No training schedules yet.'}</p>
        ) : (
          <div className="space-y-2">
            {viewSchedules.length > SCHEDULE_PAGE_SIZE && (
              <div className="relative mb-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={scheduleQuery}
                  onChange={(e) => { setScheduleQuery(e.target.value); setSchedulePage(1) }}
                  placeholder="Search schedules by training name or Business Unit…"
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            )}
            {paginate(filteredSchedules, schedulePage, SCHEDULE_PAGE_SIZE).map((s) => {
              const isExpanded = expandedId === s.id
              return (
                <div key={s.id} className="border border-slate-200 rounded-lg">
                  <button
                    onClick={() => { setExpandedId(isExpanded ? null : s.id); setAttendeeResult(null); setPending([]); setSearchQuery(''); setAttendeePage(1) }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.trainingName}</p>
                      <p className="text-xs text-slate-500">
                        {s.businessUnit} · {fmtDate(s.startDate)}–{fmtDate(s.endDate)} · {s.hours ? `${s.hours}h` : 'no hours set'} ·{' '}
                        {s.costPerAttendee ? `₦${s.costPerAttendee.toLocaleString()}/attendee` : 'no cost set'} · {s.attendeeCount} attendee{s.attendeeCount === 1 ? '' : 's'}
                        {s.trainingType ? ` · ${s.trainingType}` : ''}{s.capability ? ` · ${s.capability}` : ''}{s.vendor ? ` · ${s.vendor}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Pre: {s.preSent}/{s.attendeeCount} · Post-1: {s.post1Sent}/{s.attendeeCount} · Post-2: {s.post2Sent}/{s.attendeeCount}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-4">
                      {/* Bulk send buttons — Pre-Training never applies to a schedule sourced from Already Attended Trainings, since that training already happened; all three stages are further filtered per-schedule by preEnabled/post1Enabled/post2Enabled (set at creation, editable via Edit) */}
                      <div className="flex flex-wrap items-center gap-2">
                        {(s.sourcedFromHistoricalData ? (['post1', 'post2'] as const) : (['pre', 'post1', 'post2'] as const))
                          .filter((stage) => (stage === 'pre' ? s.preEnabled : stage === 'post1' ? s.post1Enabled : s.post2Enabled))
                          .map((stage) => {
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
                          onClick={() => refreshAttendees(s.id)}
                          disabled={refreshingId === s.id || s.attendeeCount === 0}
                          title="Re-pulls email and line manager info from the current roster — fixes attendees added before their email was on file"
                          className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {refreshingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Refresh from Roster
                        </button>
                        <button
                          onClick={() => toggleReminders(s)}
                          title="Whether the daily cron sweep sends reminder nudges for unfilled surveys on this schedule"
                          className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 border ${
                            s.remindersEnabled ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50' : 'text-slate-400 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Reminders: {s.remindersEnabled ? 'On' : 'Off'}
                        </button>
                        <button
                          onClick={() => startEditSchedule(s)}
                          className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 ml-auto"
                        >
                          <PenLine className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => deleteSchedule(s.id)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete schedule
                        </button>
                      </div>
                      {refreshResult && refreshResult.scheduleId === s.id && (
                        <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
                          <p className="text-emerald-700">Refreshed {refreshResult.updated} of {refreshResult.total} attendee(s) from the roster.</p>
                          {refreshResult.stillMissing.length > 0 && (
                            <p className="text-amber-700">Still missing an email in the roster: {refreshResult.stillMissing.join(', ')}</p>
                          )}
                        </div>
                      )}
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
                      {s.attendees.length > 0 && (() => {
                        const aq = attendeeTableQuery.trim().toLowerCase()
                        const filteredAttendees = s.attendees.filter((a) =>
                          !aq || a.staffName.toLowerCase().includes(aq) || a.email?.toLowerCase().includes(aq) || a.lineManagerName?.toLowerCase().includes(aq)
                        )
                        return (
                          <div className="overflow-x-auto">
                            {s.attendees.length > ATTENDEE_PAGE_SIZE && (
                              <div className="relative mb-2">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                  value={attendeeTableQuery}
                                  onChange={(e) => { setAttendeeTableQuery(e.target.value); setAttendeePage(1) }}
                                  placeholder="Search attendees by name, email, or line manager…"
                                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                                />
                              </div>
                            )}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-400 border-b border-slate-100">
                                  <th className="text-left font-medium py-1.5 pr-3">Name</th>
                                  <th className="text-left font-medium py-1.5 pr-3">Email</th>
                                  <th className="text-left font-medium py-1.5 pr-3">Line Manager</th>
                                  {s.additionalCcMode === 'individual' && <th className="text-left font-medium py-1.5 pr-3">Additional Cc</th>}
                                  {!s.sourcedFromHistoricalData && s.preEnabled && <th className="text-center font-medium py-1.5 pr-3">Pre</th>}
                                  {s.post1Enabled && <th className="text-center font-medium py-1.5 pr-3">Post-1</th>}
                                  {s.post2Enabled && <th className="text-center font-medium py-1.5 pr-3">Post-2</th>}
                                  <th className="py-1.5"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginate(filteredAttendees, attendeePage, ATTENDEE_PAGE_SIZE).map((a) => (
                                  <tr key={a.id} className="border-b border-slate-50">
                                    <td className="py-1.5 pr-3 text-slate-700">{a.staffName}</td>
                                    <td className="py-1.5 pr-3 text-slate-500">{a.email || '—'}</td>
                                    <td className="py-1.5 pr-3 text-slate-500">{a.lineManagerName || '—'}</td>
                                    {s.additionalCcMode === 'individual' && (
                                      <td className="py-1.5 pr-3">
                                        <input
                                          value={ccDrafts[a.id] ?? a.additionalCc ?? ''}
                                          onChange={(e) => setCcDrafts({ ...ccDrafts, [a.id]: e.target.value })}
                                          onBlur={(e) => saveAttendeeCc(s.id, a.id, e.target.value)}
                                          placeholder="none"
                                          disabled={savingCcId === a.id}
                                          className="w-40 border border-slate-200 rounded px-1.5 py-1 text-[11px] disabled:opacity-50"
                                        />
                                      </td>
                                    )}
                                    {(s.sourcedFromHistoricalData ? [
                                      ['post1SurveySentAt', 'post1SurveyRespondedAt', 'post1'],
                                      ['post2SurveySentAt', 'post2SurveyRespondedAt', 'post2'],
                                    ] as const : [
                                      ['preSurveySentAt', 'preSurveyRespondedAt', 'pre'],
                                      ['post1SurveySentAt', 'post1SurveyRespondedAt', 'post1'],
                                      ['post2SurveySentAt', 'post2SurveyRespondedAt', 'post2'],
                                    ] as const)
                                      .filter(([, , stage]) => (stage === 'pre' ? s.preEnabled : stage === 'post1' ? s.post1Enabled : s.post2Enabled))
                                      .map(([sentField, respondedField, stage]) => {
                                      const cellKey = `${s.id}:${stage}:${a.id}`
                                      const state = tickState(a[sentField], a[respondedField], settings.expiryEnabled, settings.expiryDays)
                                      return (
                                        <td key={sentField} className="py-1.5 pr-3 text-center">
                                          <button
                                            type="button"
                                            onClick={() => sendStage(s.id, stage, [a.id])}
                                            disabled={sendingKey === cellKey}
                                            title={`${state === 'unsent' ? 'Send' : 'Resend'} ${STAGE_LABELS[stage]} to ${a.staffName} (${state}${state !== 'unsent' ? ' — resending resets the expiry clock' : ''})`}
                                            className="hover:opacity-70 disabled:opacity-40"
                                          >
                                            {sendingKey === cellKey ? (
                                              <Loader2 className="w-3 h-3 animate-spin text-slate-400 mx-auto" />
                                            ) : (
                                              <span className={TICK_STYLE[state]}>{TICK_SYMBOL[state]}</span>
                                            )}
                                          </button>
                                        </td>
                                      )
                                    })}
                                    <td className="py-1.5 text-right">
                                      <button onClick={() => removeAttendee(s.id, a.id)} className="text-slate-300 hover:text-red-600">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <Pagination page={attendeePage} totalItems={filteredAttendees.length} pageSize={ATTENDEE_PAGE_SIZE} onChange={setAttendeePage} />
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {!loadingSchedules && schedules.length > 0 && (
          <Pagination page={schedulePage} totalItems={filteredSchedules.length} pageSize={SCHEDULE_PAGE_SIZE} onChange={setSchedulePage} />
        )}
      </div>

      <p className="text-xs text-slate-400 px-1">
        A daily automated check also sends Pre (up to a week before start), Post-1 (from a day after end), and Post-2 (from a month after end) to
        anyone who hasn&apos;t received that stage yet — the buttons above are for sending sooner or resending manually.
      </p>
    </div>
  )
}
