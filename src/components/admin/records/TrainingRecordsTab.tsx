'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, ChevronUp, Trash2, Save, Loader2, X, Pencil, AlertTriangle, Plus, Calendar, Download, Upload, Users } from 'lucide-react'
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
  staffName: string; staffId: string; businessUnit: string; cost: string; hours: string; trainingType: string; capability: string; vendor: string; training: string
}

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

interface NamedOption { id: string; name: string }
interface VendorOption extends NamedOption { order: number }

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
  const [applyingToSimilar, setApplyingToSimilar] = useState(false)

  // Add New Training (creates a real TrainingSchedule + attendees — same endpoints Survey
  // Automation uses — rather than a bare TrainingRecord, so it's immediately eligible for
  // Pre/Post-1/Post-2 sends, not just a static data row).
  const [addingNew, setAddingNew] = useState(false)
  const [directory, setDirectory] = useState<RosterStaff[]>([])
  const [businessUnits, setBusinessUnits] = useState<NamedOption[]>([])
  const [trainingTypes, setTrainingTypes] = useState<NamedOption[]>([])
  const [capabilities, setCapabilities] = useState<NamedOption[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [addingVendorForId, setAddingVendorForId] = useState<string | null>(null)
  const [newVendorInput, setNewVendorInput] = useState('')
  const [savingNewVendor, setSavingNewVendor] = useState(false)
  const [newTraining, setNewTraining] = useState({
    trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '', costPerAttendee: '', trainingType: '', capability: '', vendor: '',
    trainingMode: 'physical' as 'physical' | 'virtual' | 'platform', location: '', meetingLink: '',
    preEnabled: true, post1Enabled: true, post2Enabled: true,
    additionalCc: '', additionalCcMode: 'all' as 'all' | 'individual',
  })
  const [surveyDaysAfter, setSurveyDaysAfter] = useState({ preDaysBefore: 7, post1DaysAfter: 1, post2DaysAfter: 30 })
  // Only used when additionalCcMode === 'individual' — who (beyond the automatic line-manager Cc
  // and the platform-wide default Cc) each specific attendee should also Cc, picked from the same
  // roster search as the attendee picker itself.
  const [pendingAttendeeCc, setPendingAttendeeCc] = useState<Record<string, RosterStaff[]>>({})
  const [ccSearchQuery, setCcSearchQuery] = useState<Record<string, string>>({})
  const [attendeeQuery, setAttendeeQuery] = useState('')
  const [pendingAttendees, setPendingAttendees] = useState<RosterStaff[]>([])
  const [creatingSchedule, setCreatingSchedule] = useState(false)
  const [createError, setCreateError] = useState('')

  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkResult, setBulkResult] = useState<{ added: number; notFound: string[] } | null>(null)
  const bulkCsvRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    fetch('/api/admin/roster-directory').then((r) => r.json()).then((d) => setDirectory(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/business-units').then((r) => r.json()).then((d) => setBusinessUnits(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/training-types').then((r) => r.json()).then((d) => setTrainingTypes(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/capabilities').then((r) => r.json()).then((d) => setCapabilities(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/vendors').then((r) => r.json()).then((d) => setVendors(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/admin/survey-settings').then((r) => r.json()).then((d) => setSurveyDaysAfter({
      preDaysBefore: d.preDaysBefore ?? 7, post1DaysAfter: d.post1DaysAfter ?? 1, post2DaysAfter: d.post2DaysAfter ?? 30,
    })).catch(() => {})
  }, [])

  const attendeeResults = useMemo(() => {
    const q = attendeeQuery.trim().toLowerCase()
    if (!q) return []
    const pendingIds = new Set(pendingAttendees.map((p) => p.staffId))
    return directory.filter((s) => !pendingIds.has(s.staffId) && (s.name.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))).slice(0, 8)
  }, [attendeeQuery, directory, pendingAttendees])

  const resetNewTrainingForm = () => {
    setNewTraining({
      trainingName: '', businessUnit: '', startDate: '', endDate: '', hours: '', costPerAttendee: '', trainingType: '', capability: '', vendor: '',
      trainingMode: 'physical', location: '', meetingLink: '',
      preEnabled: true, post1Enabled: true, post2Enabled: true,
      additionalCc: '', additionalCcMode: 'all',
    })
    setPendingAttendees([])
    setAttendeeQuery('')
    setPendingAttendeeCc({})
    setCcSearchQuery({})
    setAddingNew(false)
    setCreateError('')
  }

  // First attendee picked sets the Business Unit automatically, same convention as Survey
  // Automation's own form — still editable via the dropdown in case a training intentionally
  // spans multiple BUs.
  const addAttendee = (s: RosterStaff) => {
    setPendingAttendees((prev) => [...prev, s])
    setAttendeeQuery('')
    setNewTraining((prev) => (prev.businessUnit ? prev : { ...prev, businessUnit: s.businessUnit }))
  }

  // Shared core: resolves a list of already-split identifier tokens (Staff ID, email, or full
  // name) against the already-loaded roster directory, client-side — nothing to send to the
  // server until the whole schedule is created.
  const matchIdentifierTokens = (tokens: string[]): { found: RosterStaff[]; notFound: string[] } => {
    const found: RosterStaff[] = []
    const notFound: string[] = []
    const pendingIds = new Set(pendingAttendees.map((p) => p.staffId))
    for (const token of tokens) {
      const q = token.toLowerCase()
      const match = directory.find((s) => s.staffId.toLowerCase() === q || s.email?.toLowerCase() === q || s.name.toLowerCase() === q)
      if (!match) { notFound.push(token); continue }
      if (pendingIds.has(match.staffId) || found.some((f) => f.staffId === match.staffId)) continue
      found.push(match)
    }
    return { found, notFound }
  }

  // Line-by-line (CSV-style), but each line first tries to match AS A WHOLE (so "John Doe" on its
  // own line resolves as one person's full name) before falling back to splitting that same line
  // on spaces/commas (so "MSL-0001 MSL-0002" on one line still resolves as two people). Covers a
  // one-per-line paste, several-per-line, or a mix of both in the same paste.
  const resolveBulkIdentifiers = (text: string): { found: RosterStaff[]; notFound: string[] } => {
    const lines = text.split(/\r\n|\n/).map((l) => l.replace(/^"|"$/g, '').trim()).filter(Boolean)
      .filter((l) => !/^(staff ?id|name|email|identifier)$/i.test(l))
    const found: RosterStaff[] = []
    const notFound: string[] = []
    const addIfNew = (s: RosterStaff) => { if (!found.some((f) => f.staffId === s.staffId)) found.push(s) }

    for (const line of lines) {
      const whole = matchIdentifierTokens([line])
      if (whole.found.length === 1) { addIfNew(whole.found[0]); continue }
      const tokens = line.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)
      if (tokens.length > 1) {
        const split = matchIdentifierTokens(tokens)
        split.found.forEach(addIfNew)
        notFound.push(...split.notFound)
      } else {
        notFound.push(line)
      }
    }
    return { found, notFound }
  }

  // Pasting several Staff IDs/emails at once directly into the single search box (rather than
  // opening the dedicated bulk box) is common enough to auto-detect: a real search query is never
  // multiple space/comma-separated identifiers, so 2+ tokens (even just two, separated by one
  // space) means bulk paste, not a single search string. The one thing that ALSO produces 2
  // tokens legitimately is a single full name ("John Doe") — checked first, as one identifier,
  // before ever splitting, so a one-person paste doesn't get wrongly torn into two failed lookups.
  const handleAttendeeSearchPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim()
    if (!text) return
    const tokens = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)
    if (tokens.length < 2) return // ordinary single-value paste — let it populate the search box as usual

    const wholeStringMatch = matchIdentifierTokens([text])
    const { found, notFound } = wholeStringMatch.found.length === 1 ? wholeStringMatch : matchIdentifierTokens(tokens)

    e.preventDefault()
    if (found.length > 0) {
      setPendingAttendees((prev) => [...prev, ...found])
      setNewTraining((prev) => (prev.businessUnit ? prev : { ...prev, businessUnit: found[0].businessUnit }))
    }
    setAttendeeQuery('')
    setBulkResult({ added: found.length, notFound })
    if (notFound.length > 0) setBulkMode(true) // surface the not-found list somewhere visible
  }

  const downloadBulkTemplate = () => {
    const csv = 'Staff ID or Email or Name\nMSL-0123\nsomeone@meristemng.com\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'training_attendees_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleBulkCsv = async (file: File) => {
    setBulkText(await file.text())
  }

  const submitBulkAttendees = () => {
    const { found, notFound } = resolveBulkIdentifiers(bulkText)
    if (found.length > 0) {
      setPendingAttendees((prev) => [...prev, ...found])
      setNewTraining((prev) => (prev.businessUnit ? prev : { ...prev, businessUnit: found[0].businessUnit }))
    }
    setBulkResult({ added: found.length, notFound })
    setBulkText('')
  }

  const createSchedule = async () => {
    if (!newTraining.trainingName.trim() || !newTraining.businessUnit || !newTraining.startDate || !newTraining.endDate || pendingAttendees.length === 0) return
    setCreatingSchedule(true)
    setCreateError('')
    try {
      const scheduleRes = await fetch('/api/admin/training-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainingName: newTraining.trainingName.trim(),
          businessUnit: newTraining.businessUnit,
          startDate: newTraining.startDate, endDate: newTraining.endDate,
          hours: newTraining.hours ? Number(newTraining.hours) : undefined,
          costPerAttendee: newTraining.costPerAttendee ? Number(newTraining.costPerAttendee) : undefined,
          trainingType: newTraining.trainingType || undefined,
          capability: newTraining.capability || undefined,
          vendor: newTraining.vendor || undefined,
          trainingMode: newTraining.trainingMode,
          location: newTraining.location || undefined,
          meetingLink: newTraining.meetingLink || undefined,
          preEnabled: newTraining.preEnabled,
          post1Enabled: newTraining.post1Enabled,
          post2Enabled: newTraining.post2Enabled,
          additionalCc: newTraining.additionalCc || undefined,
          additionalCcMode: newTraining.additionalCcMode,
        }),
      })
      if (!scheduleRes.ok) {
        const data = await scheduleRes.json().catch(() => ({}))
        setCreateError(data.error || 'Failed to create schedule.')
        return
      }
      const schedule = await scheduleRes.json()
      const attendeesRes = await fetch(`/api/admin/training-schedule/${schedule.id}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: pendingAttendees.map((p) => p.staffId) }),
      })

      // Individual mode: push each attendee's own picked Cc list now that we finally have their
      // real attendeeId (createdAttendees maps staffId -> id) — anyone with none stays blank,
      // which still gets the automatic line-manager Cc and platform-wide default Cc, just no
      // extra addresses of their own.
      if (newTraining.additionalCcMode === 'individual') {
        const { createdAttendees } = await attendeesRes.json().catch(() => ({ createdAttendees: [] as { id: string; staffId: string }[] }))
        for (const a of (createdAttendees || [])) {
          const ccList = pendingAttendeeCc[a.staffId]
          if (!ccList || ccList.length === 0) continue
          const ccString = ccList.map((c) => c.email).filter(Boolean).join(', ')
          if (!ccString) continue
          await fetch(`/api/admin/training-schedule/${schedule.id}/attendees/${a.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ additionalCc: ccString }),
          }).catch(() => {})
        }
      }

      // If any stage is already due right now — same exact windows the daily cron itself checks —
      // send it immediately instead of making everyone wait for tomorrow's tick. A stage that
      // ISN'T due yet is untouched here; the cron picks it up once it actually becomes due.
      const daysUntilStart = (new Date(newTraining.startDate).getTime() - Date.now()) / 86400000
      const daysSinceEnd = (Date.now() - new Date(newTraining.endDate).getTime()) / 86400000
      if (newTraining.preEnabled && daysUntilStart <= surveyDaysAfter.preDaysBefore && daysUntilStart >= -3) {
        await fetch(`/api/admin/training-schedule/${schedule.id}/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'pre' }),
        }).catch(() => {})
      }
      if (newTraining.post1Enabled && daysSinceEnd >= surveyDaysAfter.post1DaysAfter) {
        await fetch(`/api/admin/training-schedule/${schedule.id}/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'post1' }),
        }).catch(() => {})
      }
      if (newTraining.post2Enabled && daysSinceEnd >= surveyDaysAfter.post2DaysAfter) {
        await fetch(`/api/admin/training-schedule/${schedule.id}/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'post2' }),
        }).catch(() => {})
      }

      resetNewTrainingForm()
      setPage(1)
      await load()
    } finally {
      setCreatingSchedule(false)
    }
  }

  const groupKey = (g: TrainingGroup) => `${g.training}|${g.month}|${g.year}`

  const toggleExpand = (g: TrainingGroup) => {
    const key = groupKey(g)
    setExpandedKey(expandedKey === key ? null : key)
    setEditingId(null)
    setConfirmingGroupKey(null)
  }

  const saveNewVendor = async (rowId: string) => {
    const name = newVendorInput.trim()
    if (!name) return
    // Same name, different case/spacing — just select the existing one instead of creating a duplicate.
    const existing = vendors.find((v) => v.name.trim().toLowerCase() === name.toLowerCase())
    if (existing) {
      setDraft((d) => (d ? { ...d, vendor: existing.name } : d))
      setAddingVendorForId(null)
      setNewVendorInput('')
      return
    }
    setSavingNewVendor(true)
    try {
      const nextOrder = vendors.length > 0 ? Math.max(...vendors.map((v) => v.order)) + 1 : 0
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, order: nextOrder }),
      })
      if (res.ok) {
        const fresh = await fetch('/api/vendors').then((r) => r.json()).catch(() => [])
        setVendors(Array.isArray(fresh) ? fresh : [])
        setDraft((d) => (d ? { ...d, vendor: name } : d))
      }
    } finally {
      setSavingNewVendor(false)
      setAddingVendorForId(null)
      setNewVendorInput('')
    }
  }

  const startEdit = (r: TrainingRecordRow, g: TrainingGroup) => {
    setEditingId(r.id)
    setDraft({
      staffName: r.staffName, staffId: r.staffId, businessUnit: r.businessUnit,
      cost: String(r.cost), hours: r.hours != null ? String(r.hours) : '',
      trainingType: r.trainingType || '', capability: r.capability || '', vendor: r.vendor || '',
      training: g.training,
    })
  }

  const saveEdit = async (r: TrainingRecordRow, g: TrainingGroup) => {
    if (!draft) return
    setSaving(true)
    try {
      const newCost = parseFloat(draft.cost) || 0
      const changedIdentity = {
        training: draft.training.trim() !== g.training ? draft.training.trim() : undefined,
        trainingType: (draft.trainingType || null) !== r.trainingType ? (draft.trainingType || null) : undefined,
        cost: newCost !== r.cost ? newCost : undefined,
        vendor: (draft.vendor || null) !== r.vendor ? (draft.vendor || null) : undefined,
      }
      const changes = Object.fromEntries(Object.entries(changedIdentity).filter(([, v]) => v !== undefined))

      const res = await fetch(`/api/admin/records/training/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffName: draft.staffName, staffId: draft.staffId, businessUnit: draft.businessUnit,
          training: draft.training, cost: newCost, hours: draft.hours ? parseFloat(draft.hours) : null,
          trainingType: draft.trainingType || null, capability: draft.capability || null, vendor: draft.vendor || null,
        }),
      })
      if (!res.ok) { alert('Failed to save.'); return }

      setEditingId(null); setDraft(null)

      if (Object.keys(changes).length > 0) {
        const fieldNames = Object.keys(changes).join(', ')
        if (confirm(`Apply this ${fieldNames} change to every other record with the training name "${g.training}" too (any month/year)?`)) {
          setApplyingToSimilar(true)
          try {
            const applyRes = await fetch('/api/admin/records/training/apply-to-similar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ originalTrainingName: g.training, excludeId: r.id, changes }),
            })
            const applyData = await applyRes.json().catch(() => ({}))
            if (applyRes.ok) alert(`Applied to ${applyData.updated} other record${applyData.updated === 1 ? '' : 's'}.`)
          } finally {
            setApplyingToSimilar(false)
          }
        }
      }
      await load()
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
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="Search training, name, Staff ID, or Business Unit…"
            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        {!addingNew && (
          <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg px-3 py-2 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add Training Schedule
          </button>
        )}
      </div>

      {addingNew && (
        <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" /> New Training Schedule
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Training name"
              value={newTraining.trainingName}
              onChange={(e) => setNewTraining({ ...newTraining, trainingName: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
            />
            <select
              value={newTraining.businessUnit}
              onChange={(e) => setNewTraining({ ...newTraining, businessUnit: e.target.value })}
              className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
            >
              <option value="">Business Unit — auto-fills once you add an attendee below</option>
              {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
            </select>
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Attendees — search by name, email, or Staff ID (add as many as are going)</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={attendeeQuery}
                onChange={(e) => setAttendeeQuery(e.target.value)}
                onPaste={handleAttendeeSearchPaste}
                placeholder="Type a name, email, or Staff ID… (or paste several at once)"
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              {attendeeResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {attendeeResults.map((s) => (
                    <button key={s.staffId} onClick={() => addAttendee(s)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2">
                      <span className="text-slate-700">{s.name}</span>
                      <span className="text-slate-400">{s.staffId} · {s.businessUnit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {pendingAttendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {pendingAttendees.map((p) => (
                  <span key={p.staffId} className="flex items-center gap-1 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
                    {p.name}
                    <button
                      onClick={() => {
                        setPendingAttendees(pendingAttendees.filter((x) => x.staffId !== p.staffId))
                        setPendingAttendeeCc((prev) => { const next = { ...prev }; delete next[p.staffId]; return next })
                      }}
                      className="hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {bulkResult && !bulkMode && (
              <div className="text-xs space-y-0.5 mt-2">
                <p className="text-emerald-700">{bulkResult.added} added from the pasted list.</p>
                {bulkResult.notFound.length > 0 && <p className="text-red-600">Not found in the roster: {bulkResult.notFound.join(', ')}</p>}
              </div>
            )}

            {!bulkMode ? (
              <button onClick={() => { setBulkMode(true); setBulkResult(null) }} className="flex items-center gap-1.5 text-xs text-navy-600 hover:underline mt-2">
                <Users className="w-3.5 h-3.5" /> Or paste/upload a list of many at once
              </button>
            ) : (
              <div className="mt-2 border border-dashed border-slate-300 rounded-lg p-3 space-y-2 bg-slate-50">
                <p className="text-[11px] text-slate-500">Staff IDs or emails — one per line, or several separated by spaces/commas (full names with spaces should be added one at a time above instead). Or download the template, fill it in, and upload it.</p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={'MSL-0123\nsomeone@meristemng.com'}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
                {bulkResult && (
                  <div className="text-xs space-y-0.5">
                    <p className="text-emerald-700">{bulkResult.added} added.</p>
                    {bulkResult.notFound.length > 0 && <p className="text-red-600">Not found in the roster: {bulkResult.notFound.join(', ')}</p>}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={submitBulkAttendees} disabled={!bulkText.trim()} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                    <Plus className="w-3.5 h-3.5" /> Add List
                  </button>
                  <button onClick={downloadBulkTemplate} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
                    <Download className="w-3.5 h-3.5" /> Download Template
                  </button>
                  <button onClick={() => bulkCsvRef.current?.click()} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
                    <Upload className="w-3.5 h-3.5" /> Upload CSV
                  </button>
                  <input ref={bulkCsvRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBulkCsv(f); e.target.value = '' }} />
                  <button onClick={() => { setBulkMode(false); setBulkText(''); setBulkResult(null) }} className="text-xs text-slate-500 hover:text-slate-700 ml-auto">Close</button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-500">
              Start date
              <input type="date" value={newTraining.startDate} onChange={(e) => setNewTraining({ ...newTraining, startDate: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
            <label className="text-xs text-slate-500">
              End date
              <input type="date" value={newTraining.endDate} onChange={(e) => setNewTraining({ ...newTraining, endDate: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
            <label className="text-xs text-slate-500">
              Hours
              <input type="number" value={newTraining.hours} onChange={(e) => setNewTraining({ ...newTraining, hours: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-xs text-slate-500">
              Cost per attendee
              <input type="number" value={newTraining.costPerAttendee} onChange={(e) => setNewTraining({ ...newTraining, costPerAttendee: e.target.value })} placeholder="Applied to every attendee's row" className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
            </label>
            <label className="text-xs text-slate-500">
              Training Type
              <select value={newTraining.trainingType} onChange={(e) => setNewTraining({ ...newTraining, trainingType: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1">
                <option value="">Select…</option>
                {trainingTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Differentiating Capability
              <select value={newTraining.capability} onChange={(e) => setNewTraining({ ...newTraining, capability: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1">
                <option value="">Select…</option>
                {capabilities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Vendor
              <select value={newTraining.vendor} onChange={(e) => setNewTraining({ ...newTraining, vendor: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1">
                <option value="">Select…</option>
                {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Cost, type, and capability feed the Training Data sheet (Admin → Live Data Source → Training Cost tab) for every attendee added.
            Vendor is used by the Talent Members report (Admin → Vendors manages this list). All are set once here and apply to the whole schedule.
          </p>

          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Where</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {([
                ['physical', 'Physical'],
                ['virtual', 'Virtual'],
                ['platform', 'Learning Platform'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNewTraining({ ...newTraining, trainingMode: value })}
                  className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
                    newTraining.trainingMode === value ? 'bg-blue-600 text-white border-blue-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {newTraining.trainingMode === 'physical' ? (
              <input
                value={newTraining.location}
                onChange={(e) => setNewTraining({ ...newTraining, location: e.target.value })}
                placeholder="Venue address"
                className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              />
            ) : (
              <input
                value={newTraining.meetingLink}
                onChange={(e) => setNewTraining({ ...newTraining, meetingLink: e.target.value })}
                placeholder={newTraining.trainingMode === 'virtual' ? 'Meeting link (Zoom, Teams, etc.)' : 'Learning platform link'}
                className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
              />
            )}
            <p className="text-[11px] text-slate-400 mt-1">Included in the Pre-Training email so attendees know where to go.</p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Surveys to send</p>
            <div className="flex flex-wrap items-center gap-4">
              {([
                ['preEnabled', 'Pre-Training'],
                ['post1Enabled', 'Post-1'],
                ['post2Enabled', 'Post-2'],
              ] as const).map(([field, label]) => (
                <label key={field} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={newTraining[field]}
                    onChange={(e) => setNewTraining({ ...newTraining, [field]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              All three are on by default. Uncheck any stage to disable it entirely for this schedule — it will never be sent, initially or as a reminder.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
              <input
                type="checkbox"
                checked={newTraining.additionalCcMode === 'individual'}
                onChange={(e) => setNewTraining({ ...newTraining, additionalCcMode: e.target.checked ? 'individual' : 'all' })}
              />
              Add a different Cc per participant
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Everyone already gets the automatic line-manager Cc and the platform-wide default Cc (Admin → SMTP Settings) — this is only for
              extra people on top of that, and only for specific participants who need it. Leave unchecked to just use the defaults for everyone.
            </p>
            {newTraining.additionalCcMode === 'individual' && (
              <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white">
                {pendingAttendees.length === 0 ? (
                  <p className="text-[11px] text-slate-400">Add attendees above first, then pick extra Cc recipients for each of them here.</p>
                ) : (
                  pendingAttendees.map((p) => {
                    const query = ccSearchQuery[p.staffId] || ''
                    const selected = pendingAttendeeCc[p.staffId] || []
                    const selectedIds = new Set(selected.map((c) => c.staffId))
                    const results = query.trim()
                      ? directory.filter((s) => s.staffId !== p.staffId && !selectedIds.has(s.staffId) &&
                          (s.name.toLowerCase().includes(query.toLowerCase()) || s.staffId.toLowerCase().includes(query.toLowerCase()) || s.email?.toLowerCase().includes(query.toLowerCase())))
                        .slice(0, 6)
                      : []
                    return (
                      <div key={p.staffId} className="border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                        <p className="text-xs font-medium text-slate-700 mb-1">{p.name}</p>
                        <div className="relative">
                          <input
                            value={query}
                            onChange={(e) => setCcSearchQuery({ ...ccSearchQuery, [p.staffId]: e.target.value })}
                            placeholder="Search by name, email, or Staff ID to add a Cc…"
                            className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs"
                          />
                          {results.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                              {results.map((s) => (
                                <button
                                  key={s.staffId}
                                  type="button"
                                  onClick={() => {
                                    setPendingAttendeeCc({ ...pendingAttendeeCc, [p.staffId]: [...selected, s] })
                                    setCcSearchQuery({ ...ccSearchQuery, [p.staffId]: '' })
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
                                >
                                  <span className="text-slate-700">{s.name}</span>
                                  <span className="text-slate-400">{s.email || s.staffId}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {selected.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {selected.map((c) => (
                              <span key={c.staffId} className="flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 rounded-full pl-2 pr-1 py-0.5">
                                {c.name}
                                <button
                                  type="button"
                                  onClick={() => setPendingAttendeeCc({ ...pendingAttendeeCc, [p.staffId]: selected.filter((x) => x.staffId !== c.staffId) })}
                                  className="hover:text-red-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
                <p className="text-[11px] text-slate-400 pt-1">Anyone left blank here still gets the automatic line-manager Cc and the platform-wide default Cc, just no extra addresses of their own.</p>
              </div>
            )}
          </div>

          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={createSchedule}
              disabled={creatingSchedule || !newTraining.trainingName.trim() || !newTraining.businessUnit || !newTraining.startDate || !newTraining.endDate || pendingAttendees.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {creatingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create Schedule
            </button>
            <button onClick={resetNewTrainingForm} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}

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
                      <table className="w-full text-xs min-w-[960px]">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-100">
                            <th className="px-2.5 py-2">Name</th>
                            <th className="px-2.5 py-2">Staff ID</th>
                            <th className="px-2.5 py-2">Business Unit</th>
                            <th className="px-2.5 py-2">Training</th>
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
                                    <td className="px-2.5 py-1.5"><input value={draft.training} onChange={(e) => setDraft({ ...draft, training: e.target.value })} className="w-36 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} className="w-20 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5"><input type="number" value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} className="w-16 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5">
                                      <select value={draft.trainingType} onChange={(e) => setDraft({ ...draft, trainingType: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1">
                                        <option value="">—</option>
                                        {trainingTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      <select value={draft.capability} onChange={(e) => setDraft({ ...draft, capability: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1">
                                        <option value="">—</option>
                                        {capabilities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      {addingVendorForId === r.id ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            autoFocus
                                            value={newVendorInput}
                                            onChange={(e) => setNewVendorInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveNewVendor(r.id) }}
                                            placeholder="New vendor name"
                                            className="w-24 border border-slate-200 rounded px-1.5 py-1"
                                          />
                                          <button
                                            onClick={() => saveNewVendor(r.id)}
                                            disabled={savingNewVendor || !newVendorInput.trim()}
                                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                          >
                                            {savingNewVendor ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                          </button>
                                          <button onClick={() => { setAddingVendorForId(null); setNewVendorInput('') }} className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50">
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <select
                                          value={draft.vendor}
                                          onChange={(e) => {
                                            if (e.target.value === '__add_new__') { setNewVendorInput(''); setAddingVendorForId(r.id); return }
                                            setDraft({ ...draft, vendor: e.target.value })
                                          }}
                                          className="w-28 border border-slate-200 rounded px-1.5 py-1"
                                        >
                                          <option value="">—</option>
                                          {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                                          <option value="__add_new__">+ Add new vendor…</option>
                                        </select>
                                      )}
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => saveEdit(r, g)} disabled={saving || applyingToSimilar} className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                                          {saving || applyingToSimilar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
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
                                    <td className="px-2.5 py-2 text-slate-600">{g.training}</td>
                                    <td className="px-2.5 py-2 text-slate-600 tabular-nums"><NairaSign className="w-3 h-3 inline mr-0.5" />{r.cost.toLocaleString()}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.hours ?? '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.trainingType || '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.capability || '—'}</td>
                                    <td className="px-2.5 py-2 text-slate-600">{r.vendor || '—'}</td>
                                    <td className="px-2.5 py-2">
                                      <div className="flex items-center gap-1 justify-end">
                                        <button onClick={() => startEdit(r, g)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil className="w-3 h-3" /></button>
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
