'use client'

import { useEffect, useMemo, useState } from 'react'
import { UserMinus, Plus, Trash2, Search, X, Loader2 } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

interface Exemption {
  id: string
  staffId: string | null
  name: string | null
  email: string | null
  reason: string | null
}

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

interface PendingExemption extends RosterStaff {
  reason: string
}

export function TalentMemberExemptionPanel() {
  const currentYear = new Date().getFullYear()
  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i)
  const [year, setYear] = useState(currentYear)
  const [exemptions, setExemptions] = useState<Exemption[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [addingNew, setAddingNew] = useState(false)
  const [directory, setDirectory] = useState<RosterStaff[]>([])
  const [rosterStaffIds, setRosterStaffIds] = useState<Set<string> | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pending, setPending] = useState<PendingExemption[]>([])
  const [saving, setSaving] = useState(false)

  const load = async (y: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/talent-member-exemptions?year=${y}`)
      setExemptions(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(year) }, [year]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/admin/roster-directory')
      .then((res) => res.json())
      .then((data) => setDirectory(Array.isArray(data) ? data : []))
      .catch(() => {})
    // Only current Talent Members can be meaningfully exempted — searching the whole staff
    // directory here let admins pick someone who isn't actually on the TM roster, which then
    // silently failed to resolve and didn't count on the report (the "not reflecting" bug).
    fetch('/api/admin/talent-member-roster')
      .then((res) => res.json())
      .then((data: { staffId: string | null; resolved: boolean }[]) =>
        setRosterStaffIds(new Set(data.filter((e) => e.resolved && e.staffId).map((e) => e.staffId as string)))
      )
      .catch(() => setRosterStaffIds(new Set()))
  }, [])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !rosterStaffIds) return []
    const pendingIds = new Set(pending.map((p) => p.staffId))
    return directory
      .filter((r) => rosterStaffIds.has(r.staffId) && !pendingIds.has(r.staffId))
      .filter((r) => r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [searchQuery, directory, pending, rosterStaffIds])

  const addToPending = (staff: RosterStaff) => {
    setPending((prev) => [...prev, { ...staff, reason: '' }])
    setSearchQuery('')
  }

  const removeFromPending = (staffId: string) => {
    setPending((prev) => prev.filter((p) => p.staffId !== staffId))
  }

  const setPendingReason = (staffId: string, reason: string) => {
    setPending((prev) => prev.map((p) => (p.staffId === staffId ? { ...p, reason } : p)))
  }

  const saveAll = async () => {
    if (pending.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/talent-member-exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          items: pending.map((p) => ({ staffId: p.staffId, name: p.name, email: p.email, reason: p.reason })),
        }),
      })
      if (res.ok) {
        setPending([])
        setAddingNew(false)
        await load(year)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to save exemptions.')
      }
    } finally {
      setSaving(false)
    }
  }

  const cancelAdding = () => {
    setPending([])
    setSearchQuery('')
    setAddingNew(false)
  }

  const deleteExemption = async (id: string) => {
    if (!confirm('Remove this exemption?')) return
    setDeleting(id)
    try {
      await fetch('/api/admin/talent-member-exemptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await load(year)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <SectionCard
      icon={UserMinus}
      title="Talent Member (TM) Exemptions"
      description="Staff excused from this year's TM Trainings completion requirement — search and select, add a reason for each, then save. Excluded from the Yet to Attend list and from the coverage % denominator on the Talent Members report."
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableYears.map((y) => <option key={y} value={y}>{y}{y === currentYear ? ' (current)' : ''}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-2">
            {exemptions.length === 0 && <p className="text-xs text-slate-400">No exemptions for {year} yet.</p>}
            {exemptions.map((e) => (
              <div key={e.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-3">
                <div className="flex-1 min-w-0 text-sm text-slate-700">
                  <span className="font-medium">{e.name || e.staffId || e.email}</span>
                  {(e.staffId || e.email) && e.name && (
                    <span className="text-slate-400 ml-2 text-xs">{[e.staffId, e.email].filter(Boolean).join(' · ')}</span>
                  )}
                  {e.reason && <p className="text-xs text-slate-400 mt-0.5">{e.reason}</p>}
                </div>
                <button
                  onClick={() => deleteExemption(e.id)}
                  disabled={deleting === e.id}
                  className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0"
                >
                  {deleting === e.id ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            ))}

            {!addingNew ? (
              <button
                onClick={() => setAddingNew(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors w-full justify-center"
              >
                <Plus className="w-4 h-4" /> Add Exemption
              </button>
            ) : (
              <div className="border border-blue-200 rounded-lg p-3 space-y-3">
                <p className="text-[11px] text-slate-400">Searches current Talent Members only — someone not on the TM roster can&apos;t be exempted from it.</p>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or Staff ID…"
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
                          <span className="text-slate-400">{r.staffId}{r.email ? ` · ${r.email}` : ''} · {r.businessUnit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {pending.length > 0 && (
                  <div className="space-y-2">
                    {pending.map((p) => (
                      <div key={p.staffId} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <div className="text-xs text-slate-700 font-medium w-40 shrink-0 truncate" title={p.name}>{p.name}</div>
                        <input
                          value={p.reason}
                          onChange={(e) => setPendingReason(p.staffId, e.target.value)}
                          placeholder="Reason (optional)"
                          className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={() => removeFromPending(p.staffId)} className="text-slate-400 hover:text-red-600 shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={saveAll}
                    disabled={saving || pending.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Save {pending.length > 0 ? `${pending.length} ` : ''}Exemption{pending.length === 1 ? '' : 's'}
                  </button>
                  <button onClick={cancelAdding} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
