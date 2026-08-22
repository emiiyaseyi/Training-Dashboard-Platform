'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
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

  const [mode, setMode] = useState<'individual' | 'bulk'>('individual')
  const [single, setSingle] = useState({ name: '', staffId: '', email: '' })
  const [bulkText, setBulkText] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const addSingle = async () => {
    if (!single.name.trim() && !single.staffId.trim() && !single.email.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/admin/talent-member-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(single),
      })
      if (res.ok) {
        setSingle({ name: '', staffId: '', email: '' })
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
      description="Add or remove Talent Members here — bulk paste (one per line) or one at a time, by name, Staff ID, or email. Every entry is mirrored into the sheet tab configured under Admin → Live Data Source."
      defaultOpen
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setMode('individual')}
            className={`px-3 py-1.5 rounded-lg border font-medium ${mode === 'individual' ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            Add Individually
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`px-3 py-1.5 rounded-lg border font-medium ${mode === 'bulk' ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            Add in Bulk
          </button>
        </div>

        {mode === 'individual' ? (
          <div className="border border-slate-200 rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={single.name}
                onChange={(e) => setSingle((p) => ({ ...p, name: e.target.value }))}
                placeholder="Name"
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                value={single.staffId}
                onChange={(e) => setSingle((p) => ({ ...p, staffId: e.target.value }))}
                placeholder="Staff ID"
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="email"
                value={single.email}
                onChange={(e) => setSingle((p) => ({ ...p, email: e.target.value }))}
                placeholder="Email"
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={addSingle}
              disabled={adding || (!single.name.trim() && !single.staffId.trim() && !single.email.trim())}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
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
