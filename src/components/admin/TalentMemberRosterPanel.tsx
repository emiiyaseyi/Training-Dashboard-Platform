'use client'

import { useEffect, useMemo, useState } from 'react'
import { Users, Plus, Trash2, RefreshCw, Loader2, CheckCircle2, AlertTriangle, Search, X } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

interface RosterEntry {
  id: string
  staffId: string | null
  name: string | null
  email: string | null
  resolvedName: string | null
  businessUnit: string | null
  resolved: boolean
  sheetSyncedAt: string | null
  sheetSyncError: string | null
}

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

interface Props {
  onChanged: () => void
}

export function TalentMemberRosterPanel({ onChanged }: Props) {
  const [entries, setEntries] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [autoResolving, setAutoResolving] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryingAll, setRetryingAll] = useState(false)
  const [refreshingDirectory, setRefreshingDirectory] = useState(false)

  const [mode, setMode] = useState<'search' | 'bulk'>('search')
  const [directory, setDirectory] = useState<RosterStaff[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [pending, setPending] = useState<RosterStaff[]>([])
  const [bulkText, setBulkText] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/roster-directory')
      .then((res) => res.json())
      .then((data) => setDirectory(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const onRosterStaffIds = useMemo(
    () => new Set(entries.map((e) => e.staffId).filter(Boolean) as string[]),
    [entries]
  )

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const pendingIds = new Set(pending.map((p) => p.staffId))
    return directory
      .filter((r) => !pendingIds.has(r.staffId) && !onRosterStaffIds.has(r.staffId))
      .filter((r) => r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [searchQuery, directory, pending, onRosterStaffIds])

  const addToPending = (staff: RosterStaff) => {
    setPending((prev) => [...prev, staff])
    setSearchQuery('')
  }

  const removeFromPending = (staffId: string) => {
    setPending((prev) => prev.filter((p) => p.staffId !== staffId))
  }

  const retryOne = async (e: RosterEntry) =>
    fetch(`/api/admin/talent-member-roster/${e.id}/retry-sync`, { method: 'POST' }).catch(() => {})

  const fetchEntries = async (): Promise<RosterEntry[] | null> => {
    setLoadError('')
    try {
      const res = await fetch('/api/admin/talent-member-roster')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Failed to load (${res.status}).`)
      }
      const data = (await res.json()) as RosterEntry[]
      setEntries(data)
      return data
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load the Talent Member roster.')
      return null
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true)
      const initial = await fetchEntries()
      setLoading(false)
      const unsynced = (initial || []).filter((e) => !e.sheetSyncedAt)
      if (unsynced.length > 0) {
        setAutoResolving(true)
        for (const e of unsynced) await retryOne(e)
        await fetchEntries()
        setAutoResolving(false)
      }
    })()
  }, [])

  const retry = async (e: RosterEntry) => {
    setRetryingId(e.id)
    try {
      await retryOne(e)
      await fetchEntries()
    } finally {
      setRetryingId(null)
    }
  }

  const retryAll = async () => {
    setRetryingAll(true)
    try {
      for (const e of entries.filter((e) => !e.sheetSyncedAt)) await retryOne(e)
      await fetchEntries()
    } finally {
      setRetryingAll(false)
    }
  }

  const refreshFromDirectory = async () => {
    setRefreshingDirectory(true)
    try {
      const res = await fetch('/api/admin/talent-member-roster/refresh-from-directory', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      await fetchEntries()
      onChanged()
      if (res.ok) alert(`Updated ${data.updated} of ${data.total} entries from the staff directory.`)
      else alert(data.error || 'Failed to refresh from the staff directory.')
    } finally {
      setRefreshingDirectory(false)
    }
  }

  const addSelected = async () => {
    if (pending.length === 0) return
    setAdding(true)
    try {
      const res = await fetch('/api/admin/talent-member-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: pending.map((p) => p.staffId) }),
      })
      if (res.ok) {
        setPending([])
        await fetchEntries()
        onChanged()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to add.')
      }
    } finally {
      setAdding(false)
    }
  }

  const addBulk = async () => {
    const lines = bulkText.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setAdding(true)
    try {
      const res = await fetch('/api/admin/talent-member-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: lines }),
      })
      if (res.ok) {
        const data = await res.json()
        setBulkText('')
        await fetchEntries()
        onChanged()
        alert(`Added ${data.added} Talent Member${data.added === 1 ? '' : 's'}.`)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to add.')
      }
    } finally {
      setAdding(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this person from the Talent Member roster?')) return
    setDeletingId(id)
    try {
      await fetch('/api/admin/talent-member-roster', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await fetchEntries()
      onChanged()
    } finally {
      setDeletingId(null)
    }
  }

  const unsynced = entries.filter((e) => !e.sheetSyncedAt)

  return (
    <SectionCard
      icon={Users}
      title={`Talent Member Roster (${entries.length})`}
      description="Add or remove Talent Members here — search the staff directory and select as many as needed, or paste a list. Every entry is mirrored into the sheet tab configured under Admin → Live Data Source."
      headerActions={
        <button
          onClick={(e) => { e.stopPropagation(); refreshFromDirectory() }}
          disabled={refreshingDirectory}
          title="Re-match every entry against the staff directory and fill in any missing Name/Staff ID/Email"
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshingDirectory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Update Missing Details
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setMode('search')}
            className={`px-3 py-1.5 rounded-lg border font-medium ${mode === 'search' ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            Search Staff
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`px-3 py-1.5 rounded-lg border font-medium ${mode === 'bulk' ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            Paste a List
          </button>
        </div>

        {mode === 'search' ? (
          <div className="border border-slate-200 rounded-lg p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Search by name, email, or Staff ID (add as many as needed)</label>
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
                        <span className="text-slate-400">{r.staffId}{r.email ? ` · ${r.email}` : ''} · {r.businessUnit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {pending.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
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

            <button
              onClick={addSelected}
              disabled={adding || pending.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add {pending.length > 0 ? `${pending.length} ` : ''}Selected
            </button>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg p-3 space-y-3">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'One person per line — name, Staff ID, or email:\nJane Doe\nMSL0091\njane.doe@meristemng.com'}
              rows={6}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <button
              onClick={addBulk}
              disabled={adding || !bulkText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add All
            </button>
          </div>
        )}

        {/* Sheet sync status — self-healing, same pattern as the other mirror panels */}
        {(unsynced.length > 0 || loadError) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {loadError || `${unsynced.length} ${unsynced.length === 1 ? 'entry' : 'entries'} not yet synced to the sheet`}
              </p>
              {unsynced.length > 0 && (
                <button
                  onClick={retryAll}
                  disabled={retryingAll}
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-2.5 py-1 hover:bg-navy-700 disabled:opacity-50"
                >
                  {retryingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Retry All
                </button>
              )}
            </div>
            {autoResolving && <p className="text-[11px] text-amber-700">Auto-retrying…</p>}
          </div>
        )}

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-slate-400">No Talent Members added yet.</p>
        ) : (
          <div className="space-y-1.5">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 border border-slate-100 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0 text-xs">
                  <span className="font-medium text-slate-800">{e.resolvedName || e.name || e.staffId || e.email}</span>
                  <span className="text-slate-400 ml-2">{[e.businessUnit, e.staffId, e.email].filter(Boolean).join(' · ')}</span>
                </div>
                <span
                  title={e.resolved ? 'Matched to a current staff member' : 'Not found on the staff roster yet'}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${e.resolved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                >
                  {e.resolved ? 'Matched' : 'Not matched'}
                </span>
                {e.sheetSyncedAt ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : (
                  <button onClick={() => retry(e)} disabled={retryingId === e.id} title={e.sheetSyncError || 'Not yet synced'} className="shrink-0">
                    {retryingId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : <RefreshCw className="w-3.5 h-3.5 text-amber-500" />}
                  </button>
                )}
                <button onClick={() => remove(e.id)} disabled={deletingId === e.id} className="text-slate-300 hover:text-red-600 shrink-0">
                  {deletingId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
