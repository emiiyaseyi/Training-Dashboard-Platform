'use client'

import { useEffect, useState } from 'react'
import { Search, ChevronDown, ChevronUp, Trash2, Save, Loader2, X, Pencil, AlertTriangle } from 'lucide-react'
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
  staffName: string; staffId: string; businessUnit: string; cost: string; hours: string; trainingType: string; capability: string; vendor: string
}

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

  const groupKey = (g: TrainingGroup) => `${g.training}|${g.month}|${g.year}`

  const toggleExpand = (g: TrainingGroup) => {
    const key = groupKey(g)
    setExpandedKey(expandedKey === key ? null : key)
    setEditingId(null)
    setConfirmingGroupKey(null)
  }

  const startEdit = (r: TrainingRecordRow) => {
    setEditingId(r.id)
    setDraft({
      staffName: r.staffName, staffId: r.staffId, businessUnit: r.businessUnit,
      cost: String(r.cost), hours: r.hours != null ? String(r.hours) : '',
      trainingType: r.trainingType || '', capability: r.capability || '', vendor: r.vendor || '',
    })
  }

  const saveEdit = async (id: string) => {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/records/training/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffName: draft.staffName, staffId: draft.staffId, businessUnit: draft.businessUnit,
          cost: parseFloat(draft.cost) || 0, hours: draft.hours ? parseFloat(draft.hours) : null,
          trainingType: draft.trainingType || null, capability: draft.capability || null, vendor: draft.vendor || null,
        }),
      })
      if (res.ok) { setEditingId(null); setDraft(null); await load() }
      else alert('Failed to save.')
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
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          placeholder="Search training, name, Staff ID, or Business Unit…"
          className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

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
                      <table className="w-full text-xs min-w-[820px]">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-100">
                            <th className="px-2.5 py-2">Name</th>
                            <th className="px-2.5 py-2">Staff ID</th>
                            <th className="px-2.5 py-2">Business Unit</th>
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
                                    <td className="px-2.5 py-1.5"><input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} className="w-20 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input type="number" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} className="w-16 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input value={draft.trainingType} onChange={(e) => setDraft({ ...draft, trainingType: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input value={draft.capability} onChange={(e) => setDraft({ ...draft, capability: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5">
                                      <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => saveEdit(r.id)} disabled={saving} className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
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
                                    <td className="px-2.5 py-2 text-slate-600 tabular-nums"><NairaSign className="w-3 h-3 inline mr-0.5" />{r.cost.toLocaleString()}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.hours ?? '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.trainingType || '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.capability || '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.vendor || '—'}</td>
                                    <td className="px-2.5 py-2">
                                      <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil className="w-3 h-3" /></button>
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
