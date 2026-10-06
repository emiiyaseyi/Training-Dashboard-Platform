'use client'

import { useEffect, useState } from 'react'
import { Target, Loader2, Save, CheckCircle2 } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

export function SkillsGapSettingsPanel() {
  const [criticalThreshold, setCriticalThreshold] = useState(30)
  const [moderateThreshold, setModerateThreshold] = useState(60)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/skills-gap-settings')
      .then((r) => r.json())
      .then((data) => {
        setCriticalThreshold(data.criticalThreshold ?? 30)
        setModerateThreshold(data.moderateThreshold ?? 60)
      })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/admin/skills-gap-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criticalThreshold, moderateThreshold }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to save.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      icon={Target}
      title="Skills Gap Settings"
      description="Severity bands for the Skills & Competency Gaps page — a capability/group combination at or below the Critical threshold is flagged Critical, above that but at or below Moderate is flagged Moderate, anything higher is Healthy."
    >
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Critical threshold (%)</label>
              <input
                type="number" min={0} max={100} step={1}
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">Coverage at or below this % is Critical</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Moderate threshold (%)</label>
              <input
                type="number" min={0} max={100} step={1}
                value={moderateThreshold}
                onChange={(e) => setModerateThreshold(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">Coverage at or below this % (but above Critical) is Moderate</p>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-2 hover:bg-navy-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      )}
    </SectionCard>
  )
}
