'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Save, Check } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

export function SecuritySettingsPanel() {
  const [seconds, setSeconds] = useState('90')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/security-settings')
      .then((res) => res.json())
      .then((data) => setSeconds(String(data.idleTimeoutSeconds ?? 90)))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch('/api/admin/security-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idleTimeoutSeconds: parseInt(seconds, 10) }),
      })
      const data = await res.json()
      if (res.ok) {
        setSeconds(String(data.idleTimeoutSeconds))
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        setError(data.error || 'Failed to save.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      icon={ShieldCheck}
      title="Security — Idle Logout"
      description="Signs a user out automatically after this many seconds of no activity, or of the browser tab being hidden/unfocused. Applies platform-wide, to every signed-in user."
    >
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Idle timeout (seconds)</label>
            <input
              type="number"
              min={10}
              max={3600}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">Between 10 and 3600 seconds (1 hour). Default is 90.</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </SectionCard>
  )
}
