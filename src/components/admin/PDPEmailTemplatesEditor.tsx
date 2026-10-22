'use client'

import { useEffect, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'

interface Template {
  kind: string
  subject: string
  body: string
  buttonLabel: string
  showFallbackLink: boolean
  isCustomized: boolean
  tokens: string[]
}

const KIND_LABELS: Record<string, string> = {
  staffSurvey: 'Staff Survey (Track A launch)',
  managerValidation: 'Manager Validation (Track A review)',
  managerTeam: "Manager Team-Fill (Track B launch)",
}

// Every PDP email's subject/body/button label/fallback-link is editable here, per cycle — nothing
// about the actual wording sent is hardcoded in the app. A kind with no saved customization shows
// the built-in default, which the admin can edit (creating a customization) or leave as-is.
export function PDPEmailTemplatesEditor({ cycleId }: { cycleId: string }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [activeKind, setActiveKind] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string; buttonLabel: string; showFallbackLink: boolean }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')

  const load = () => {
    setLoading(true)
    fetch(`/api/admin/pdp/${cycleId}/email-templates`)
      .then((r) => r.json())
      .then((data: { templates: Template[] }) => {
        setTemplates(data.templates || [])
        const nextDrafts: typeof drafts = {}
        for (const t of data.templates || []) nextDrafts[t.kind] = { subject: t.subject, body: t.body, buttonLabel: t.buttonLabel, showFallbackLink: t.showFallbackLink }
        setDrafts(nextDrafts)
        if (!activeKind && data.templates?.[0]) setActiveKind(data.templates[0].kind)
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [cycleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (kind: string) => {
    const draft = drafts[kind]
    if (!draft) return
    setSaving(kind)
    setSaveError('')
    try {
      const res = await fetch(`/api/admin/pdp/${cycleId}/email-templates/${kind}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveError(data.error || 'Failed to save.'); return }
      load()
    } finally {
      setSaving(null)
    }
  }

  const resetToDefault = async (kind: string) => {
    if (!confirm('Reset this email to the built-in default? Your customization will be lost.')) return
    setResetting(kind)
    try {
      await fetch(`/api/admin/pdp/${cycleId}/email-templates/${kind}`, { method: 'DELETE' })
      load()
    } finally {
      setResetting(null)
    }
  }

  if (loading) return <p className="text-xs text-slate-400">Loading…</p>

  const active = templates.find((t) => t.kind === activeKind)
  const draft = active ? drafts[active.kind] : null

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {templates.map((t) => (
          <button
            key={t.kind}
            onClick={() => setActiveKind(t.kind)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${activeKind === t.kind ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-slate-600 border-slate-200 hover:border-navy-300'}`}
          >
            {KIND_LABELS[t.kind] || t.kind}
            {t.isCustomized && <span className="ml-1.5 text-[10px] opacity-80">(customized)</span>}
          </button>
        ))}
      </div>

      {active && draft && (
        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <p className="text-[11px] text-slate-400">
            Tokens available here: {active.tokens.map((t) => `{{${t}}}`).join(', ')}. Paragraphs separated by a blank line become separate lines in the email — HTML tags (e.g. <code>&lt;strong&gt;</code>, <code>&lt;ul&gt;</code>) are allowed.
          </p>
          <label className="text-xs text-slate-500 block">
            Subject
            <input value={draft.subject} onChange={(e) => setDrafts({ ...drafts, [active.kind]: { ...draft, subject: e.target.value } })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
          </label>
          <label className="text-xs text-slate-500 block">
            Body
            <textarea value={draft.body} onChange={(e) => setDrafts({ ...drafts, [active.kind]: { ...draft, body: e.target.value } })} rows={14} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1 font-mono text-xs" />
          </label>
          <label className="text-xs text-slate-500 block max-w-xs">
            Button label
            <input value={draft.buttonLabel} onChange={(e) => setDrafts({ ...drafts, [active.kind]: { ...draft, buttonLabel: e.target.value } })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={draft.showFallbackLink} onChange={(e) => setDrafts({ ...drafts, [active.kind]: { ...draft, showFallbackLink: e.target.checked } })} />
            Show &quot;If the button doesn&apos;t work, copy this link&quot; fallback text under the button (off by default)
          </label>
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => save(active.kind)} disabled={saving === active.kind} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
              {saving === active.kind && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
            </button>
            {active.isCustomized && (
              <button onClick={() => resetToDefault(active.kind)} disabled={resetting === active.kind} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50">
                {resetting === active.kind ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reset to default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
