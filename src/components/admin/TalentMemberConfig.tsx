'use client'

import { useEffect, useState } from 'react'
import { Users, Save } from 'lucide-react'

export function TalentMemberConfigPanel() {
  const currentYear = new Date().getFullYear()
  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i)
  const [year, setYear] = useState(currentYear)
  const [headcount, setHeadcount] = useState('0')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = (y: number) => {
    setLoading(true)
    fetch(`/api/admin/talent-member?year=${y}`)
      .then((r) => r.json())
      .then((data) => setHeadcount(String(data.totalHeadcount ?? 0)))
      .catch(() => setHeadcount('0'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load(year) }, [year]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/admin/talent-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, totalHeadcount: parseInt(headcount) || 0 }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-slate-400" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Talent Member (TM) Population</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Total headcount of staff classified as Talent Members, per year — used by the Talent Member Trainings report to calculate how many are trained vs. yet to be trained.
          </p>
        </div>
      </div>

      <div className="flex items-end gap-4">
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
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Total TM Headcount</label>
          <input
            type="number"
            min="0"
            value={loading ? '' : headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            disabled={loading}
            className="w-40 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums disabled:opacity-50"
            placeholder="0"
          />
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">Saved</span>}
      </div>
    </div>
  )
}
