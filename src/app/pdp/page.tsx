'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { RefreshCw, Plus, Send, Users, Loader2, Download, UserPlus, Trash2, BellOff, ChevronDown, ChevronUp, Search, X, XCircle, Mail, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { usePagePermission } from '@/lib/use-page-permission'
import { exportPDPCycleExcel } from '@/lib/pdp-export'
import { PDPQuestionsEditor } from '@/components/admin/PDPQuestionsEditor'

interface Cycle {
  id: string
  year: number
  title: string
  status: string
  maxCapabilitiesPerPerson: number | null
  expiryDays: number
  priorityQuestionLabel: string | null
  actionQuestionLabel: string | null
  actionRequired: boolean
  launchedAt: string | null
  _count: { staffSurveys: number; managerSurveys: number; managerOverrides: number }
}

interface Validation { id: string; managerName: string | null; respondedAt: string | null; answers: string | null }
interface StaffSurvey { id: string; staffId: string; staffName: string; businessUnit: string; sentAt: string | null; respondedAt: string | null; answers: string | null; validations: Validation[] }
interface TeamMember { id: string; staffId: string; staffName: string; businessUnit: string | null; status: string; submittedAt: string | null; answers: string | null }
interface ManagerSurvey { id: string; managerStaffId: string; managerName: string; sentAt: string | null; respondedAt: string | null; rosterConfirmedAt: string | null; teamMembers: TeamMember[] }
interface Question { id: string; order: number; label: string; description: string | null; type: string; options: string | null; ratingMax: number; required: boolean }
interface CycleDetail { cycle: Cycle; staffSurveys: StaffSurvey[]; managerSurveys: ManagerSurvey[]; overrides: { staffId: string; secondManagerStaffId: string }[]; questions: Question[] }

interface RosterStaff { staffId: string; name: string; email: string | null; businessUnit: string }
interface BusinessUnitOption { id: string; name: string }

type AudienceType = 'all' | 'businessUnit' | 'department' | 'selected'

function AudiencePicker({
  label, businessUnits, roster, type, setType, value, setValue, selected, setSelected,
}: {
  label: string
  businessUnits: BusinessUnitOption[]
  roster: RosterStaff[]
  type: AudienceType
  setType: (t: AudienceType) => void
  value: string
  setValue: (v: string) => void
  selected: RosterStaff[]
  setSelected: (s: RosterStaff[]) => void
}) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const pickedIds = new Set(selected.map((p) => p.staffId))
    return roster.filter((r) => !pickedIds.has(r.staffId) && (r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q))).slice(0, 8)
  }, [query, roster, selected])

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <select value={type} onChange={(e) => setType(e.target.value as AudienceType)} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs">
        <option value="all">Everyone</option>
        <option value="businessUnit">By Business Unit</option>
        <option value="department">By Department</option>
        <option value="selected">Specific people (for testing)</option>
      </select>
      {type === 'businessUnit' && (
        <select value={value} onChange={(e) => setValue(e.target.value)} className="block border border-slate-300 rounded-md px-2.5 py-1.5 text-xs w-full max-w-xs">
          <option value="">Select Business Unit…</option>
          {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
        </select>
      )}
      {type === 'department' && (
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Department name" className="block border border-slate-300 rounded-md px-2.5 py-1.5 text-xs w-full max-w-xs" />
      )}
      {type === 'selected' && (
        <div>
          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or Staff ID…"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.staffId}
                    type="button"
                    onClick={() => { setSelected([...selected, r]); setQuery('') }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <span>{r.name}</span>
                    <span className="text-slate-400">{r.staffId}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selected.map((p) => (
                <span key={p.staffId} className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
                  {p.name}
                  <button type="button" onClick={() => setSelected(selected.filter((s) => s.staffId !== p.staffId))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PDPPage() {
  const { canAdmin, canExport } = usePagePermission()
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CycleDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [roster, setRoster] = useState<RosterStaff[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1)
  const [newTitle, setNewTitle] = useState('')
  const [newMax, setNewMax] = useState('')
  const [newExpiry, setNewExpiry] = useState('30')
  const [creating, setCreating] = useState(false)

  const [staffAudienceType, setStaffAudienceType] = useState<AudienceType>('all')
  const [staffAudienceValue, setStaffAudienceValue] = useState('')
  const [staffAudienceSelected, setStaffAudienceSelected] = useState<RosterStaff[]>([])
  const [managerAudienceType, setManagerAudienceType] = useState<AudienceType>('all')
  const [managerAudienceValue, setManagerAudienceValue] = useState('')
  const [managerAudienceSelected, setManagerAudienceSelected] = useState<RosterStaff[]>([])

  const [launchingStaff, setLaunchingStaff] = useState(false)
  const [launchingManagers, setLaunchingManagers] = useState(false)
  const [launchResult, setLaunchResult] = useState<{ track: string; created: number; sent: number; skipped: { name: string; reason: string }[] } | null>(null)

  const [overrideStaffId, setOverrideStaffId] = useState('')
  const [overrideManagerId, setOverrideManagerId] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)
  const [overrideError, setOverrideError] = useState('')

  const [exporting, setExporting] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportQuery, setReportQuery] = useState('')
  const [stoppingId, setStoppingId] = useState<string | null>(null)

  const [disablingAll, setDisablingAll] = useState(false)
  const [disableResult, setDisableResult] = useState<number | null>(null)
  const [sendingIgnoreEmail, setSendingIgnoreEmail] = useState(false)
  const [ignoreEmailResult, setIgnoreEmailResult] = useState<{ sent: number; skipped: { name: string; reason: string }[] } | null>(null)

  const loadCycles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/pdp')
      const data = await res.json()
      setCycles(Array.isArray(data) ? data : [])
      if (Array.isArray(data) && data.length > 0 && !selectedId) setSelectedId(data[0].id)
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/pdp/${id}`)
      setDetail(await res.json())
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => { loadCycles() }, [loadCycles])
  useEffect(() => { if (selectedId) loadDetail(selectedId) }, [selectedId, loadDetail])
  useEffect(() => {
    fetch('/api/admin/roster-directory').then((r) => r.json()).then((d) => setRoster(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/business-units').then((r) => r.json()).then((d) => setBusinessUnits(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const createCycle = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/pdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: newYear, title: newTitle, maxCapabilitiesPerPerson: newMax ? Number(newMax) : null, expiryDays: newExpiry ? Number(newExpiry) : 30 }),
      })
      const cycle = await res.json()
      if (res.ok) {
        setShowCreate(false)
        setNewTitle('')
        setNewMax('')
        setNewExpiry('30')
        await loadCycles()
        setSelectedId(cycle.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const buildAudience = (type: AudienceType, value: string, selected: RosterStaff[]) => {
    if (type === 'businessUnit') return { type, value }
    if (type === 'department') return { type, value }
    if (type === 'selected') return { type, value: selected.map((s) => s.staffId) }
    return { type: 'all' as const }
  }

  const launchStaff = async () => {
    if (!selectedId) return
    setLaunchingStaff(true)
    setLaunchResult(null)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/launch-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience: buildAudience(staffAudienceType, staffAudienceValue, staffAudienceSelected) }),
      })
      const data = await res.json()
      if (res.ok) setLaunchResult({ track: 'Staff Self-Fill', ...data })
      else alert(data.error || 'Failed to launch.')
      await loadCycles()
      await loadDetail(selectedId)
    } finally {
      setLaunchingStaff(false)
    }
  }

  const launchManagers = async () => {
    if (!selectedId) return
    setLaunchingManagers(true)
    setLaunchResult(null)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/launch-managers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience: buildAudience(managerAudienceType, managerAudienceValue, managerAudienceSelected) }),
      })
      const data = await res.json()
      if (res.ok) setLaunchResult({ track: 'Manager Team-Fill', ...data })
      else alert(data.error || 'Failed to launch.')
      await loadCycles()
      await loadDetail(selectedId)
    } finally {
      setLaunchingManagers(false)
    }
  }

  const addOverride = async () => {
    if (!selectedId || !overrideStaffId.trim() || !overrideManagerId.trim()) return
    setSavingOverride(true)
    setOverrideError('')
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: overrideStaffId.trim(), secondManagerStaffId: overrideManagerId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setOverrideError(data.error || 'Failed to add.'); return }
      setOverrideStaffId('')
      setOverrideManagerId('')
      await loadDetail(selectedId)
    } finally {
      setSavingOverride(false)
    }
  }

  const removeOverride = async (staffId: string) => {
    if (!selectedId) return
    await fetch(`/api/admin/pdp/${selectedId}/overrides?staffId=${encodeURIComponent(staffId)}`, { method: 'DELETE' })
    await loadDetail(selectedId)
  }

  const downloadExcel = async () => {
    if (!detail) return
    setExporting(true)
    try {
      await exportPDPCycleExcel(detail.cycle.title, detail.staffSurveys, detail.managerSurveys)
    } finally {
      setExporting(false)
    }
  }

  const stopReminders = async (kind: 'staff-survey' | 'validation' | 'manager-survey', id: string) => {
    if (!selectedId) return
    setStoppingId(id)
    try {
      await fetch(`/api/admin/pdp/${kind}/${id}/stop-reminders`, { method: 'POST' })
      await loadDetail(selectedId)
    } finally {
      setStoppingId(null)
    }
  }

  const disableAllManagerLinks = async () => {
    if (!selectedId) return
    if (!confirm('Disable every not-yet-completed Track B manager link for this cycle? Anyone who already finished is left untouched. This cannot be undone from here.')) return
    setDisablingAll(true)
    setDisableResult(null)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/manager-survey/disable-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: "This link has been disabled. The email \"2027 PDP: Your Team's Development Plans\" was sent in error during internal testing. Please disregard it, no action is needed on your part. Full details on the 2027 Personal Development Plan process, including when you'll be asked to complete it for your team, will be shared with you separately. We apologise for the confusion." }),
      })
      const data = await res.json()
      if (res.ok) setDisableResult(data.disabled)
      else alert(data.error || 'Failed to disable links.')
      await loadDetail(selectedId)
    } finally {
      setDisablingAll(false)
    }
  }

  const sendIgnoreEmail = async () => {
    if (!selectedId) return
    if (!confirm("Send the 'please disregard' email to every manager who received the Track B launch email for this cycle (skipping anyone no longer active on the roster)? This sends real email right now.")) return
    setSendingIgnoreEmail(true)
    setIgnoreEmailResult(null)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/manager-survey/send-ignore-email`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) setIgnoreEmailResult(data)
      else alert(data.error || 'Failed to send.')
    } finally {
      setSendingIgnoreEmail(false)
    }
  }

  const selfSubmitted = detail?.staffSurveys.filter((s) => s.respondedAt).length ?? 0
  const selfTotal = detail?.staffSurveys.length ?? 0
  const validationsSubmitted = detail?.staffSurveys.reduce((s, x) => s + x.validations.filter((v) => v.respondedAt).length, 0) ?? 0
  const validationsTotal = detail?.staffSurveys.reduce((s, x) => s + x.validations.length, 0) ?? 0
  const teamMembersSubmitted = detail?.managerSurveys.reduce((s, m) => s + m.teamMembers.filter((t) => t.submittedAt).length, 0) ?? 0
  const teamMembersTotal = detail?.managerSurveys.reduce((s, m) => s + m.teamMembers.filter((t) => t.status === 'accepted' || t.status === 'added').length, 0) ?? 0

  const q = reportQuery.trim().toLowerCase()
  const filteredStaffSurveys = detail ? detail.staffSurveys.filter((s) => !q || s.staffName.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q)) : []
  const filteredManagerSurveys = detail ? detail.managerSurveys.filter((m) => !q || m.managerName.toLowerCase().includes(q) || m.managerStaffId.toLowerCase().includes(q)) : []

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Personal Development Plan"
        subtitle="Launch and track PDP campaigns — staff self-fill and manager team-fill, both pre-filled from existing training data"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={loadCycles} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            {canAdmin && (
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700">
                <Plus className="w-3.5 h-3.5" /> New Cycle
              </button>
            )}
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">
        {showCreate && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-800">New PDP Cycle</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs text-slate-500">
                Year
                <input type="number" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
              </label>
              <label className="text-xs text-slate-500 sm:col-span-2">
                Title
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={`${newYear} Personal Development Plan`} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <label className="text-xs text-slate-500">
                Max capabilities/needs per person (optional)
                <input type="number" min={1} value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="No limit" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
              </label>
              <label className="text-xs text-slate-500">
                Reminders stop after (days unfilled)
                <input type="number" min={1} value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={createCycle} disabled={creating} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create
              </button>
              <button onClick={() => setShowCreate(false)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : cycles.length === 0 ? (
          <AlertBadge variant="info" message="No PDP cycles yet — create one above to get started." />
        ) : (
          <div className="flex gap-2 flex-wrap">
            {cycles.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border ${selectedId === c.id ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-slate-600 border-slate-200 hover:border-navy-300'}`}
              >
                {c.title} <span className="opacity-70">({c.status})</span>
              </button>
            ))}
          </div>
        )}

        {loadingDetail ? (
          <p className="text-sm text-slate-400">Loading cycle…</p>
        ) : detail && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Track A — Self-Fill</p>
                <p className="text-2xl font-bold text-slate-800">{selfSubmitted} / {selfTotal}</p>
                <p className="text-xs text-slate-400 mt-1">Manager validations: {validationsSubmitted} / {validationsTotal}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Track B — Manager Team-Fill</p>
                <p className="text-2xl font-bold text-slate-800">{teamMembersSubmitted} / {teamMembersTotal}</p>
                <p className="text-xs text-slate-400 mt-1">{detail.managerSurveys.length} manager link(s) sent</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Cap / Reminders</p>
                <p className="text-sm font-bold text-slate-800">{detail.cycle.maxCapabilitiesPerPerson ?? 'No cap'} · stop after {detail.cycle.expiryDays}d unfilled</p>
              </div>
            </div>

            {canAdmin && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
                <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Emergency: Track B links sent in error
                </p>
                <p className="text-xs text-red-700">
                  Use this if Track B went out to the wrong audience by mistake. Disabling leaves the link clickable but shows a
                  &quot;please disregard&quot; message instead of the real form (anyone who already finished is untouched). Sending the follow-up
                  email reaches everyone who was actually sent the launch email, skipping anyone no longer active on the roster.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={disableAllManagerLinks} disabled={disablingAll} className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700 disabled:opacity-50">
                    {disablingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Disable All Unfinished Track B Links
                  </button>
                  <button onClick={sendIgnoreEmail} disabled={sendingIgnoreEmail} className="flex items-center gap-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100 disabled:opacity-50">
                    {sendingIgnoreEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Send &quot;Please Disregard&quot; Email to Managers
                  </button>
                </div>
                {disableResult !== null && <p className="text-xs text-emerald-700">Disabled {disableResult} link(s).</p>}
                {ignoreEmailResult && (
                  <div className="text-xs bg-white border border-red-100 rounded-lg px-3 py-2">
                    <p className="text-emerald-700">Sent successfully to {ignoreEmailResult.sent}.</p>
                    {ignoreEmailResult.skipped.length > 0 && (
                      <p className="text-amber-700 mt-1">Failed/skipped for {ignoreEmailResult.skipped.length}: {ignoreEmailResult.skipped.slice(0, 10).map((s) => `${s.name} (${s.reason})`).join('; ')}{ignoreEmailResult.skipped.length > 10 ? '…' : ''}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <p className="text-sm font-semibold text-slate-800">Launch</p>

                <AudiencePicker
                  label="Track A audience — who gets their own self-fill link"
                  businessUnits={businessUnits} roster={roster}
                  type={staffAudienceType} setType={setStaffAudienceType}
                  value={staffAudienceValue} setValue={setStaffAudienceValue}
                  selected={staffAudienceSelected} setSelected={setStaffAudienceSelected}
                />
                <button onClick={launchStaff} disabled={launchingStaff} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                  {launchingStaff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Launch Track A (Staff Self-Fill)
                </button>

                <AudiencePicker
                  label="Track B audience — which managers get their team's link (filtered by the manager's own BU/department)"
                  businessUnits={businessUnits} roster={roster}
                  type={managerAudienceType} setType={setManagerAudienceType}
                  value={managerAudienceValue} setValue={setManagerAudienceValue}
                  selected={managerAudienceSelected} setSelected={setManagerAudienceSelected}
                />
                <button onClick={launchManagers} disabled={launchingManagers} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                  {launchingManagers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                  Launch Track B (Manager Team-Fill)
                </button>

                <p className="text-[11px] text-slate-400">
                  Re-running either only sends to people/managers not already created for this cycle — safe to re-run with a wider audience later (e.g. test with a few people first, then launch to everyone).
                </p>
                {launchResult && (
                  <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <p className="text-emerald-700">{launchResult.track}: {launchResult.created} created, {launchResult.sent} sent.</p>
                    {launchResult.skipped.length > 0 && (
                      <p className="text-amber-700 mt-1">{launchResult.skipped.length} skipped — {launchResult.skipped.slice(0, 5).map((s) => `${s.name} (${s.reason})`).join('; ')}{launchResult.skipped.length > 5 ? '…' : ''}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-slate-800 mb-1">Second Line Manager Exceptions</p>
                <p className="text-xs text-slate-500 mb-3">A staff member listed here gets a second, fully independent manager validation link — neither manager&apos;s answers overwrite the other.</p>
                <div className="flex flex-wrap items-end gap-2 mb-3">
                  <label className="text-xs text-slate-500">
                    Staff ID
                    <input value={overrideStaffId} onChange={(e) => setOverrideStaffId(e.target.value)} placeholder="e.g. MSL-0091" className="block border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1 w-40" />
                  </label>
                  <label className="text-xs text-slate-500">
                    Second Manager&apos;s Staff ID
                    <input value={overrideManagerId} onChange={(e) => setOverrideManagerId(e.target.value)} placeholder="e.g. MSL-0012" className="block border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1 w-40" />
                  </label>
                  <button onClick={addOverride} disabled={savingOverride} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                    {savingOverride ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                    Add
                  </button>
                </div>
                {overrideError && <p className="text-xs text-red-600 mb-2">{overrideError}</p>}
                {detail.overrides.length > 0 && (
                  <div className="space-y-1">
                    {detail.overrides.map((o) => (
                      <div key={o.staffId} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                        <span>{o.staffId} → second manager {o.secondManagerStaffId}</span>
                        <button onClick={() => removeOverride(o.staffId)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-amber-700 mt-2">
                  Add exceptions BEFORE launching Track A — validation links are created when a staff member submits, using whoever is on this list at that moment.
                </p>
              </div>
            )}

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <button onClick={() => setShowQuestions((v) => !v)} className="w-full flex items-center justify-between text-left">
                  <p className="text-sm font-semibold text-slate-800">Questions — see and edit what respondents are asked</p>
                  {showQuestions ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showQuestions && (
                  <div className="mt-4">
                    <PDPQuestionsEditor cycle={detail.cycle} questions={detail.questions} onReload={() => loadDetail(selectedId!)} />
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <button onClick={() => setShowReport((v) => !v)} className="w-full flex items-center justify-between text-left">
                <p className="text-sm font-semibold text-slate-800">Response Report — who&apos;s filled, who hasn&apos;t</p>
                {showReport ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {showReport && (
                <div className="mt-4 space-y-5">
                  <div className="relative max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      value={reportQuery}
                      onChange={(e) => setReportQuery(e.target.value)}
                      placeholder="Search by name or Staff ID…"
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Track A — Staff Self-Fill ({filteredStaffSurveys.length})</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-slate-100">
                            <th className="py-1.5 pr-3">Staff</th>
                            <th className="py-1.5 pr-3">BU</th>
                            <th className="py-1.5 pr-3">Sent</th>
                            <th className="py-1.5 pr-3">Filled</th>
                            <th className="py-1.5 pr-3">Manager Validation(s)</th>
                            <th className="py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStaffSurveys.map((s) => (
                            <tr key={s.id} className="border-b border-slate-50 last:border-0">
                              <td className="py-1.5 pr-3 text-slate-700">{s.staffName} <span className="text-slate-400">({s.staffId})</span></td>
                              <td className="py-1.5 pr-3 text-slate-500">{s.businessUnit}</td>
                              <td className="py-1.5 pr-3">{s.sentAt ? '✓' : '—'}</td>
                              <td className="py-1.5 pr-3">{s.respondedAt ? <span className="text-emerald-600 font-medium">✓</span> : <span className="text-slate-300">—</span>}</td>
                              <td className="py-1.5 pr-3 text-slate-500">
                                {s.validations.length === 0 ? '—' : s.validations.map((v) => `${v.managerName || 'Manager'}: ${v.respondedAt ? '✓' : 'pending'}`).join(', ')}
                              </td>
                              <td className="py-1.5 text-right">
                                {!s.respondedAt && s.sentAt && canAdmin && (
                                  <button onClick={() => stopReminders('staff-survey', s.id)} disabled={stoppingId === s.id} className="text-slate-400 hover:text-red-600" title="Stop reminders for this person">
                                    {stoppingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {filteredStaffSurveys.length === 0 && (
                            <tr><td colSpan={6} className="py-4 text-center text-slate-400">No one launched yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Track B — Manager Team-Fill ({filteredManagerSurveys.length})</p>
                    <div className="space-y-2">
                      {filteredManagerSurveys.map((m) => {
                        const active = m.teamMembers.filter((t) => t.status === 'accepted' || t.status === 'added')
                        const done = active.filter((t) => t.submittedAt).length
                        return (
                          <div key={m.id} className="border border-slate-100 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-slate-700">{m.managerName} <span className="text-slate-400">({m.managerStaffId})</span></p>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-500">
                                  {m.rosterConfirmedAt ? `${done}/${active.length} team members done` : 'Roster not yet confirmed'}
                                  {m.respondedAt && <span className="text-emerald-600 font-medium"> — complete</span>}
                                </span>
                                {!m.respondedAt && m.sentAt && canAdmin && (
                                  <button onClick={() => stopReminders('manager-survey', m.id)} disabled={stoppingId === m.id} className="text-slate-400 hover:text-red-600" title="Stop reminders for this manager">
                                    {stoppingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                            </div>
                            {active.length > 0 && (
                              <ul className="mt-1.5 text-[11px] text-slate-500 space-y-0.5">
                                {active.map((t) => (
                                  <li key={t.id}>{t.staffName} — {t.submittedAt ? <span className="text-emerald-600">done</span> : 'pending'}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                      {filteredManagerSurveys.length === 0 && <p className="text-xs text-slate-400">No managers launched yet.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {canExport && (
              <button onClick={downloadExcel} disabled={exporting} className="flex items-center gap-1.5 text-sm font-medium text-navy-700 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 disabled:opacity-50">
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Download Excel (by Business Unit)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
