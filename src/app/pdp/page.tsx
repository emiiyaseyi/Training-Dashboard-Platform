'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Plus, Send, Users, Loader2, Download, UserPlus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { usePagePermission } from '@/lib/use-page-permission'
import { exportPDPCycleExcel } from '@/lib/pdp-export'

interface Cycle {
  id: string
  year: number
  title: string
  status: string
  maxCapabilitiesPerPerson: number | null
  launchedAt: string | null
  _count: { staffSurveys: number; managerSurveys: number; managerOverrides: number }
}

interface Validation { managerName: string | null; respondedAt: string | null; answers: string | null }
interface StaffSurvey { id: string; staffId: string; staffName: string; businessUnit: string; respondedAt: string | null; answers: string | null; validations: Validation[] }
interface TeamMember { id: string; staffId: string; staffName: string; businessUnit: string | null; status: string; submittedAt: string | null; answers: string | null }
interface ManagerSurvey { id: string; managerStaffId: string; managerName: string; respondedAt: string | null; rosterConfirmedAt: string | null; teamMembers: TeamMember[] }
interface CycleDetail { cycle: Cycle; staffSurveys: StaffSurvey[]; managerSurveys: ManagerSurvey[]; overrides: { staffId: string; secondManagerStaffId: string }[] }

export default function PDPPage() {
  const { canAdmin, canExport } = usePagePermission()
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CycleDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1)
  const [newTitle, setNewTitle] = useState('')
  const [newMax, setNewMax] = useState('')
  const [creating, setCreating] = useState(false)

  const [launchingStaff, setLaunchingStaff] = useState(false)
  const [launchingManagers, setLaunchingManagers] = useState(false)
  const [launchResult, setLaunchResult] = useState<{ track: string; created: number; sent: number; skipped: { name: string; reason: string }[] } | null>(null)

  const [overrideStaffId, setOverrideStaffId] = useState('')
  const [overrideManagerId, setOverrideManagerId] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)
  const [overrideError, setOverrideError] = useState('')

  const [exporting, setExporting] = useState(false)

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

  const createCycle = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/pdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: newYear, title: newTitle, maxCapabilitiesPerPerson: newMax ? Number(newMax) : null }),
      })
      const cycle = await res.json()
      if (res.ok) {
        setShowCreate(false)
        setNewTitle('')
        setNewMax('')
        await loadCycles()
        setSelectedId(cycle.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const launchStaff = async () => {
    if (!selectedId) return
    setLaunchingStaff(true)
    setLaunchResult(null)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/launch-staff`, { method: 'POST' })
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
      const res = await fetch(`/api/admin/pdp/${selectedId}/launch-managers`, { method: 'POST' })
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

  const selfSubmitted = detail?.staffSurveys.filter((s) => s.respondedAt).length ?? 0
  const selfTotal = detail?.staffSurveys.length ?? 0
  const validationsSubmitted = detail?.staffSurveys.reduce((s, x) => s + x.validations.filter((v) => v.respondedAt).length, 0) ?? 0
  const validationsTotal = detail?.staffSurveys.reduce((s, x) => s + x.validations.length, 0) ?? 0
  const teamMembersSubmitted = detail?.managerSurveys.reduce((s, m) => s + m.teamMembers.filter((t) => t.submittedAt).length, 0) ?? 0
  const teamMembersTotal = detail?.managerSurveys.reduce((s, m) => s + m.teamMembers.filter((t) => t.status === 'accepted' || t.status === 'added').length, 0) ?? 0

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
            <label className="text-xs text-slate-500 block max-w-xs">
              Max capabilities/needs per person (optional)
              <input type="number" min={1} value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="No limit" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
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
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Cap per person</p>
                <p className="text-2xl font-bold text-slate-800">{detail.cycle.maxCapabilitiesPerPerson ?? 'No limit'}</p>
              </div>
            </div>

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-slate-800 mb-3">Launch</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={launchStaff} disabled={launchingStaff} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                    {launchingStaff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Launch Track A (Staff Self-Fill)
                  </button>
                  <button onClick={launchManagers} disabled={launchingManagers} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                    {launchingManagers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                    Launch Track B (Manager Team-Fill)
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Re-running either only sends to people/managers not already created for this cycle — safe to re-run if interrupted.
                </p>
                {launchResult && (
                  <div className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
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
