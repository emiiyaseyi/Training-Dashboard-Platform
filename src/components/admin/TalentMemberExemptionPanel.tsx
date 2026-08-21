'use client'

import { useEffect, useState } from 'react'
import { UserMinus, Plus, Trash2 } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

interface Exemption {
  id: string
  staffId: string | null
  name: string | null
  email: string | null
  reason: string | null
}

export function TalentMemberExemptionPanel() {
  const currentYear = new Date().getFullYear()
  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i)
  const [year, setYear] = useState(currentYear)
  const [exemptions, setExemptions] = useState<Exemption[]>([])
  const [loading, setLoading] = useState(true)
  const [addingNew, setAddingNew] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [newExemption, setNewExemption] = useState({ staffId: '', name: '', email: '', reason: '' })

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

  const addExemption = async () => {
    if (!newExemption.staffId.trim() && !newExemption.name.trim() && !newExemption.email.trim()) return
    setAddSaving(true)
    try {
      const res = await fetch('/api/admin/talent-member-exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, ...newExemption }),
      })
      if (res.ok) {
        setNewExemption({ staffId: '', name: '', email: '', reason: '' })
        setAddingNew(false)
        await load(year)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to add exemption.')
      }
    } finally {
      setAddSaving(false)
    }
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
      description="Staff excused from this year's TM Trainings completion requirement — entered by name, Staff ID, or email. Excluded from the Yet to Attend list and from the coverage % denominator on the Talent Members report."
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newExemption.name}
                    onChange={(e) => setNewExemption((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Name"
                    className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={newExemption.staffId}
                    onChange={(e) => setNewExemption((p) => ({ ...p, staffId: e.target.value }))}
                    placeholder="Staff ID"
                    className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    value={newExemption.email}
                    onChange={(e) => setNewExemption((p) => ({ ...p, email: e.target.value }))}
                    placeholder="Email"
                    className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <input
                  type="text"
                  value={newExemption.reason}
                  onChange={(e) => setNewExemption((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Reason (optional)"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={addExemption}
                    disabled={addSaving || (!newExemption.name.trim() && !newExemption.staffId.trim() && !newExemption.email.trim())}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {addSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add
                  </button>
                  <button onClick={() => setAddingNew(false)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
