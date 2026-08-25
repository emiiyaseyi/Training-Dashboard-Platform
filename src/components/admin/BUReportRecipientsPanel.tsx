'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

interface Recipient {
  id: string
  businessUnit: string
  name: string
  email: string
  staffId: string | null
  active: boolean
  createdAt: string
}

interface BUOption { id: string; name: string }

const emptyDraft = { businessUnit: '', name: '', email: '', staffId: '' }

export function BUReportRecipientsPanel() {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [businessUnits, setBusinessUnits] = useState<BUOption[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bu-report-recipients')
      setRecipients(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    fetch('/api/business-units').then((r) => r.json()).then((d) => setBusinessUnits(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const save = async () => {
    if (!draft.businessUnit || !draft.name.trim() || !draft.email.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/bu-report-recipients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (res.ok) {
        setAdding(false)
        setDraft(emptyDraft)
        await load()
      } else {
        setError(data.error || 'Failed to add recipient.')
      }
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (r: Recipient) => {
    setTogglingId(r.id)
    try {
      await fetch(`/api/admin/bu-report-recipients/${r.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !r.active }),
      })
      await load()
    } finally {
      setTogglingId(null)
    }
  }

  const remove = async (r: Recipient) => {
    if (!confirm(`Remove ${r.name} as the report recipient for ${r.businessUnit}? Their platform login (if one was created here) is not deleted, only this recipient record.`)) return
    setDeletingId(r.id)
    try {
      await fetch(`/api/admin/bu-report-recipients/${r.id}`, { method: 'DELETE' })
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <SectionCard
      icon={Users}
      title="Business Unit Heads — Report Recipients"
      description="Who gets the automated monthly (and quarter-end) Business Unit report by email. Adding someone here also creates their platform login, scoped to just this Business Unit, if they don't already have one."
      headerActions={
        !adding ? (
          <button onClick={() => { setAdding(true); setError('') }} className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-2.5 py-1 hover:bg-navy-50">
            <Plus className="w-3.5 h-3.5" /> Add Recipient
          </button>
        ) : undefined
      }
    >
      {adding && (
        <div className="mb-4 border border-dashed border-slate-300 rounded-lg p-3 space-y-2.5 bg-slate-50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={draft.businessUnit}
              onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
            >
              <option value="">Select Business Unit…</option>
              {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
            </select>
            <input
              placeholder="Full name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
            />
            <input
              placeholder="Email address"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
            />
            <input
              placeholder="Staff ID (optional — used as their login if given)"
              value={draft.staffId}
              onChange={(e) => setDraft({ ...draft, staffId: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !draft.businessUnit || !draft.name.trim() || !draft.email.trim()}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
            <button onClick={() => { setAdding(false); setDraft(emptyDraft); setError('') }} className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : recipients.length === 0 ? (
        <p className="text-xs text-slate-400">No report recipients configured yet.</p>
      ) : (
        <div className="space-y-2">
          {recipients.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800">{r.name} <span className="text-slate-400 font-normal">· {r.businessUnit}</span></p>
                <p className="text-[11px] text-slate-500 mt-0.5">{r.email}{r.staffId ? ` · Login: ${r.staffId}` : ''}</p>
              </div>
              <button
                onClick={() => toggleActive(r)}
                disabled={togglingId === r.id}
                title={r.active ? 'Active — receiving reports' : 'Paused — not receiving reports'}
                className={`flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-1 border shrink-0 ${
                  r.active ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50' : 'text-slate-400 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {togglingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : r.active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {r.active ? 'Active' : 'Paused'}
              </button>
              <button onClick={() => remove(r)} disabled={deletingId === r.id} className="text-slate-300 hover:text-red-600 shrink-0 disabled:opacity-50">
                {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
