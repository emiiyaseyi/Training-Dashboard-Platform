'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronUp, Trash2, Save, Loader2, X, Pencil, AlertTriangle, Plus, Calendar } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import { NairaSign } from '@/components/ui/NairaSign'

interface TrainingRecordRow {
  id: string
  staffId: string
  staffName: string
  businessUnit: string
  cost: number
  hours: number | null
  trainingType: string | null
  capability: string | null
  vendor: string | null
}

interface TrainingGroup {
  training: string
  month: string
  year: number
  businessUnits: string[]
  attendeeCount: number
  totalCost: number
  hasExistingSchedule: boolean
  records: TrainingRecordRow[]
}

interface EditDraft {
  staffName: string; staffId: string; businessUnit: string; cost: string; hours: string; trainingType: string; capability: string; vendor: string; training: string
}

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

interface NamedOption { id: string; name: string }

export function TrainingRecordsTab() {
  const [groups, setGroups] = useState<TrainingGroup[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingGroupKey, setConfirmingGroupKey] = useState<string | null>(null)
  const [alsoDeleteSchedule, setAlsoDeleteSchedule] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [applyingToSimilar, setApplyingToSimilar] = useState(false)

  // Add New Training (creates a real TrainingSchedule + attendees — same endpoints Survey
  // Automation uses — rather than a bare TrainingRecord, so it's immediately eligible for
  // Pre/Post-1/Post-2 sends, not just a static data row).
  const [addingNew, setAddingNew] = useState(false)
  const [directory, setDirectory] = useState<RosterStaff[]>([])
  const [businessUnits, setBusinessUnits] = useState<NamedOption[]>([])
  const [trainingTypes, setTrainingTypes] = useState<NamedOption[]>([])
  const [capabilities, setCapabilities] = useState<NamedOption[]>([])
  const [vendors, setVendors] = useState<NamedOption[]>([])
  const [newTraining, setNewTraining] = useState({ trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '', costPerAttendee: '', trainingType: '', capability: '', vendor: '' })
  const [attendeeQuery, setAttendeeQuery] = useState('')
  const [pendingAttendees, setPendingAttendees] = useState<RosterStaff[]>([])
  const [creatingSchedule, setCreatingSchedule] = useState(false)
  const [createError, setCreateError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/records/training?search=${encodeURIComponent(query)}&page=${page}`)
      const data = await res.json()
      setGroups(data.groups || [])
      setTotal(data.total || 0)
      setPageSize(data.pageSize || 20)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 300)
    return () => clearTimeout(t)
  }, [page, query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/admin/roster-directory').then((r) => r.json()).then((d) => setDirectory(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/business-units').then((r) => r.json()).then((d) => setBusinessUnits(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/training-types').then((r) => r.json()).then((d) => setTrainingTypes(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/capabilities').then((r) => r.json()).then((d) => setCapabilities(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/vendors').then((r) => r.json()).then((d) => setVendors(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const attendeeResults = useMemo(() => {
    const q = attendeeQuery.trim().toLowerCase()
    if (!q) return []
    const pendingIds = new Set(pendingAttendees.map((p) => p.staffId))
    return directory.filter((s) => !pendingIds.has(s.staffId) && (s.name.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))).slice(0, 8)
  }, [attendeeQuery, directory, pendingAttendees])

  const resetNewTrainingForm = () => {
    setNewTraining({ trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '', costPerAttendee: '', trainingType: '', capability: '', vendor: '' })
    setPendingAttendees([])
    setAttendeeQuery('')
    setAddingNew(false)
    setCreateError('')
  }

  // First attendee picked sets the Business Unit automatically, same convention as Survey
  // Automation's own form — still editable via the dropdown in case a training intentionally
  // spans multiple BUs.
  const addAttendee = (s: RosterStaff) => {
    setPendingAttendees((prev) => [...prev, s])
    setAttendeeQuery('')
    setNewTraining((prev) => (prev.businessUnit ? prev : { ...prev, businessUnit: s.businessUnit }))
  }

  const createSchedule = async () => {
    if (!newTraining.trainingName.trim() || !newTraining.businessUnit || !newTraining.startDate || !newTraining.endDate || pendingAttendees.length === 0) return
    setCreatingSchedule(true)
    setCreateError('')
    try {
      const scheduleRes = await fetch('/api/admin/training-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainingName: newTraining.trainingName.trim(),
          businessUnit: newTraining.businessUnit,
          startDate: newTraining.startDate, endDate: newTraining.endDate,
          hours: newTraining.hours ? Number(newTraining.hours) : undefined,
          costPerAttendee: newTraining.costPerAttendee ? Number(newTraining.costPerAttendee) : undefined,
          trainingType: newTraining.trainingType || undefined,
          capability: newTraining.capability || undefined,
          vendor: newTraining.vendor || undefined,
        }),
      })
      if (!scheduleRes.ok) {
        const data = await scheduleRes.json().catch(() => ({}))
        setCreateError(data.error || 'Failed to create schedule.')
        return
      }
      const schedule = await scheduleRes.json()
      await fetch(`/api/admin/training-schedule/${schedule.id}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: pendingAttendees.map((p) => p.staffId) }),
      })
      resetNewTrainingForm()
      setPage(1)
      await load()
    } finally {
      setCreatingSchedule(false)
    }
  }

  const groupKey = (g: TrainingGroup) => `${g.training}|${g.month}|${g.year}`

  const toggleExpand = (g: TrainingGroup) => {
    const key = groupKey(g)
    setExpandedKey(expandedKey === key ? null : key)
    setEditingId(null)
    setConfirmingGroupKey(null)
  }

  const startEdit = (r: TrainingRecordRow, g: TrainingGroup) => {
    setEditingId(r.id)
    setDraft({
      staffName: r.staffName, staffId: r.staffId, businessUnit: r.businessUnit,
      cost: String(r.cost), hours: r.hours != null ? String(r.hours) : '',
      trainingType: r.trainingType || '', capability: r.capability || '', vendor: r.vendor || '',
      training: g.training,
    })
  }

  const saveEdit = async (r: TrainingRecordRow, g: TrainingGroup) => {
    if (!draft) return
    setSaving(true)
    try {
      const newCost = parseFloat(draft.cost) || 0
      const changedIdentity = {
        training: draft.training.trim() !== g.training ? draft.training.trim() : undefined,
        trainingType: (draft.trainingType || null) !== r.trainingType ? (draft.trainingType || null) : undefined,
        cost: newCost !== r.cost ? newCost : undefined,
        vendor: (draft.vendor || null) !== r.vendor ? (draft.vendor || null) : undefined,
      }
      const changes = Object.fromEntries(Object.entries(changedIdentity).filter(([, v]) => v !== undefined))

      const res = await fetch(`/api/admin/records/training/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffName: draft.staffName, staffId: draft.staffId, businessUnit: draft.businessUnit,
          training: draft.training, cost: newCost, hours: draft.hours ? parseFloat(draft.hours) : null,
          trainingType: draft.trainingType || null, capability: draft.capability || null, vendor: draft.vendor || null,
        }),
      })
      if (!res.ok) { alert('Failed to save.'); return }

      setEditingId(null); setDraft(null)

      if (Object.keys(changes).length > 0) {
        const fieldNames = Object.keys(changes).join(', ')
        if (confirm(`Apply this ${fieldNames} change to every other record with the training name "${g.training}" too (any month/year)?`)) {
          setApplyingToSimilar(true)
          try {
            const applyRes = await fetch('/api/admin/records/training/apply-to-similar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ originalTrainingName: g.training, excludeId: r.id, changes }),
            })
            const applyData = await applyRes.json().catch(() => ({}))
            if (applyRes.ok) alert(`Applied to ${applyData.updated} other record${applyData.updated === 1 ? '' : 's'}.`)
          } finally {
            setApplyingToSimilar(false)
          }
        }
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  const deleteRecord = async (id: string) => {
    if (!confirm('Remove this participant from this training? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await fetch(`/api/admin/records/training/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  const confirmDeleteGroup = async (g: TrainingGroup) => {
    setDeletingGroup(true)
    try {
      const res = await fetch('/api/admin/records/training/delete-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ training: g.training, month: g.month, year: g.year, alsoDeleteSchedule }),
      })
      if (res.ok) {
        setConfirmingGroupKey(null)
        setAlsoDeleteSchedule(false)
        setExpandedKey(null)
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to delete training.')
      }
    } finally {
      setDeletingGroup(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="Search training, name, Staff ID, or Business Unit…"
            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        {!addingNew && (
          <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg px-3 py-2 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add Training Schedule
          </button>
        )}
      </div>

      {addingNew && (
        <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" /> New Training Schedule
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Training name"
              value={newTraining.trainingName}
              onChange={(e) => setNewTraining({ ...newTraining, trainingName: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
            />
            <select
              value={newTraining.businessUnit}
              onChange={(e) => setNewTraining({ ...newTraining, businessUnit: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
            >
              <option value="">Business Unit — auto-fills once you add an attendee below</option>
              {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
            </select>
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Attendees — search by name, email, or Staff ID (add as many as are going)</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={attendeeQuery}
                onChange={(e) => setAttendeeQuery(e.target.value)}
                placeholder="Type a name, email, or Staff ID…"
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              {attendeeResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {attendeeResults.map((s) => (
                    <button key={s.staffId} onClick={() => addAttendee(s)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2">
                      <span className="text-slate-700">{s.name}</span>
                      <span className="text-slate-400">{s.staffId} · {s.businessUnit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {pendingAttendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {pendingAttendees.map((p) => (
                  <span key={p.staffId} className="flex items-center gap-1 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
                    {p.name}
                    <button onClick={() => setPendingAttendees(pendingAttendees.filter((x) => x.staffId !== p.staffId))} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-500">
              Start date
              <input type="date" value={newTraining.startDate} onChange={(e) => setNewTraining({ ...newTraining, startDate: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
            <label className="text-xs text-slate-500">
              End date
              <input type="date" value={newTraining.endDate} onChange={(e) => setNewTraining({ ...newTraining, endDate: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
            <label className="text-xs text-slate-500">
              Hours
              <input type="number" value={newTraining.hours} onChange={(e) => setNewTraining({ ...newTraining, hours: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-xs text-slate-500">
              Cost per attendee
              <input type="number" value={newTraining.costPerAttendee} onChange={(e) => setNewTraining({ ...newTraining, costPerAttendee: e.target.value })} placeholder="Applied to every attendee's row" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
            <label className="text-xs text-slate-500">
              Training Type
              <select value={newTraining.trainingType} onChange={(e) => setNewTraining({ ...newTraining, trainingType: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1">
                <option value="">Select…</option>
                {trainingTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Differentiating Capability
              <select value={newTraining.capability} onChange={(e) => setNewTraining({ ...newTraining, capability: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1">
                <option value="">Select…</option>
                {capabilities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Vendor
              <select value={newTraining.vendor} onChange={(e) => setNewTraining({ ...newTraining, vendor: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1">
                <option value="">Select…</option>
                {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Cost, type, and capability feed the Training Data sheet (Admin → Live Data Source → Training Cost tab) for every attendee added.
            Vendor is used by the Talent Members report (Admin → Vendors manages this list). All are set once here and apply to the whole schedule.
          </p>

          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={createSchedule}
              disabled={creatingSchedule || !newTraining.trainingName.trim() || !newTraining.businessUnit || !newTraining.startDate || !newTraining.endDate || pendingAttendees.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {creatingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create Schedule
            </button>
            <button onClick={resetNewTrainingForm} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-slate-400">No training records found.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const key = groupKey(g)
            const isExpanded = expandedKey === key
            const isConfirming = confirmingGroupKey === key
            return (
              <div key={key} className="border border-slate-200 rounded-lg">
                <button onClick={() => toggleExpand(g)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{g.training}</p>
                    <p className="text-xs text-slate-500">
                      {g.businessUnits.length <= 2 ? g.businessUnits.join(', ') : `${g.businessUnits.length} Business Units`} · {g.month} {g.year} · {g.attendeeCount} attendee{g.attendeeCount === 1 ? '' : 's'} · ₦{g.totalCost.toLocaleString()}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                      <table className="w-full text-xs min-w-[960px]">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-100">
                            <th className="px-2.5 py-2">Name</th>
                            <th className="px-2.5 py-2">Staff ID</th>
                            <th className="px-2.5 py-2">Business Unit</th>
                            <th className="px-2.5 py-2">Training</th>
                            <th className="px-2.5 py-2">Cost</th>
                            <th className="px-2.5 py-2">Hours</th>
                            <th className="px-2.5 py-2">Type</th>
                            <th className="px-2.5 py-2">Capability</th>
                            <th className="px-2.5 py-2">Vendor</th>
                            <th className="px-2.5 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.records.map((r) => {
                            const isEditing = editingId === r.id
                            return (
                              <tr key={r.id} className="border-b border-slate-50">
                                {isEditing && draft ? (
                                  <>
                                    <td className="px-2.5 py-1.5"><input value={draft.staffName} onChange={(e) => setDraft({ ...draft, staffName: e.target.value })} className="w-28 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input value={draft.staffId} onChange={(e) => setDraft({ ...draft, staffId: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} className="w-32 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input value={draft.training} onChange={(e) => setDraft({ ...draft, training: e.target.value })} className="w-36 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} className="w-20 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input type="number" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} className="w-16 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5">
                                      <select value={draft.trainingType} onChange={(e) => setDraft({ ...draft, trainingType: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1">
                                        <option value="">—</option>
                                        {trainingTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      <select value={draft.capability} onChange={(e) => setDraft({ ...draft, capability: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1">
                                        <option value="">—</option>
                                        {capabilities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      <select value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} className="w-28 border border-slate-200 rounded px-1.5 py-1">
                                        <option value="">—</option>
                                        {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => saveEdit(r, g)} disabled={saving || applyingToSimilar} className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                                          {saving || applyingToSimilar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                        </button>
                                        <button onClick={() => { setEditingId(null); setDraft(null) }} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="w-3 h-3" /></button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-2.5 py-2 text-slate-800">{r.staffName}</td>
                                    <td className="px-2.5 py-2 text-slate-500">{r.staffId}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.businessUnit}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{g.training}</td>
                                    <td className="px-2.5 py-2 text-slate-600 tabular-nums"><NairaSign className="w-3 h-3 inline mr-0.5" />{r.cost.toLocaleString()}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.hours ?? '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.trainingType || '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.capability || '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.vendor || '—'}</td>
                                    <td className="px-2.5 py-2">
                                      <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => startEdit(r, g)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil className="w-3 h-3" /></button>
                                        <button onClick={() => deleteRecord(r.id)} disabled={deletingId === r.id} className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50">
                                          {deletingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {isConfirming ? (
                      <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2.5">
                        <p className="text-xs text-red-800 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          Delete all {g.attendeeCount} record{g.attendeeCount === 1 ? '' : 's'} for &quot;{g.training}&quot; ({g.month} {g.year})? This cannot be undone.
                        </p>
                        {g.hasExistingSchedule && (
                          <label className="flex items-center gap-2 text-xs text-red-800">
                            <input type="checkbox" checked={alsoDeleteSchedule} onChange={(e) => setAlsoDeleteSchedule(e.target.checked)} />
                            Also delete the matching Training Schedule for &quot;{g.training}&quot; (attendees and survey send history)
                          </label>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => confirmDeleteGroup(g)}
                            disabled={deletingGroup}
                            className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Confirm Delete
                          </button>
                          <button onClick={() => { setConfirmingGroupKey(null); setAlsoDeleteSchedule(false) }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingGroupKey(key)}
                        className="flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete This Training
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <Pagination page={page} totalItems={total} pageSize={pageSize} onChange={setPage} />
    </div>
  )
}
