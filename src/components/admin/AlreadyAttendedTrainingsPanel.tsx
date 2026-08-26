'use client'

import { useEffect, useMemo, useState } from 'react'
import { History, Search, ChevronDown, ChevronUp, Loader2, Send } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

interface HistoricalAttendee { staffId: string; staffName: string; businessUnit: string }
interface HistoricalGroup {
  training: string
  businessUnits: string[]
  month: string
  year: number
  attendeeCount: number
  attendees: HistoricalAttendee[]
}

type StageChoice = 'both' | 'post1' | 'post2'

function monthIndex(month: string): number {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const idx = MONTHS.findIndex((m) => m.toLowerCase() === month?.toLowerCase())
  return idx === -1 ? 0 : idx
}

// Builds the date string directly from the numbers, deliberately never routing through a Date
// object + toISOString() — that pairing constructs the date at LOCAL midnight, then formats it
// in UTC, which for anyone west-of-UTC... no, EAST of UTC (Nigeria, WAT = UTC+1) rolls local
// midnight on the 1st back to 23:00 UTC the day before — i.e. the LAST day of the PREVIOUS
// month. That's exactly what silently turned a July training into a June one in the email: the
// schedule's startDate landed on June 30th instead of July 1st.
function firstOfMonth(month: string, year: number): string {
  return `${year}-${String(monthIndex(month) + 1).padStart(2, '0')}-01`
}

interface Props {
  onScheduleCreated: () => void
}

export function AlreadyAttendedTrainingsPanel({ onScheduleCreated }: Props) {
  const [groups, setGroups] = useState<HistoricalGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [remindersEnabled, setRemindersEnabled] = useState(true)
  const [stageChoice, setStageChoice] = useState<StageChoice>('both')
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ key: string; added: number; notFound: string[]; noEmail: string[]; post1Sent?: number; post2Sent?: number } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/historical-trainings')
      setGroups(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const groupKey = (g: HistoricalGroup) => `${g.training}|${g.month}|${g.year}`

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.training.toLowerCase().includes(q) || g.businessUnits.some((bu) => bu.toLowerCase().includes(q)))
  }, [groups, query])

  const expand = (g: HistoricalGroup) => {
    const key = groupKey(g)
    if (expandedKey === key) {
      setExpandedKey(null)
      return
    }
    setExpandedKey(key)
    setSelected(new Set(g.attendees.map((a) => a.staffId)))
    setStartDate(firstOfMonth(g.month, g.year))
    setEndDate(firstOfMonth(g.month, g.year))
    setRemindersEnabled(true)
    setStageChoice('both')
    setResult(null)
  }

  const toggleAttendee = (staffId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(staffId)) next.delete(staffId)
      else next.add(staffId)
      return next
    })
  }

  const createAndSend = async (g: HistoricalGroup) => {
    if (selected.size === 0 || !startDate || !endDate) return
    setCreating(true)
    setResult(null)
    try {
      const scheduleRes = await fetch('/api/admin/training-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainingName: g.training,
          businessUnit: g.businessUnits[0], // nominal default only — each attendee still gets their own actual BU when added below
          startDate, endDate,
          remindersEnabled,
          post1Enabled: stageChoice !== 'post2',
          post2Enabled: stageChoice !== 'post1',
          sourcedFromHistoricalData: true,
        }),
      })
      if (!scheduleRes.ok) {
        const data = await scheduleRes.json().catch(() => ({}))
        alert(data.error || 'Failed to create schedule.')
        return
      }
      const schedule = await scheduleRes.json()
      const attendeesRes = await fetch(`/api/admin/training-schedule/${schedule.id}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: [...selected] }),
      })
      const data = await attendeesRes.json().catch(() => ({ added: 0, notFound: [], noEmail: [] }))

      // Send immediately — the whole point of "Already Attended Trainings" is catching up surveys
      // for training that already happened, so there's no reason to make the admin separately find
      // the new schedule and click Send by hand. The daily reminder sweep then picks these up
      // automatically from here, exactly like it does for any other schedule.
      let post1Sent: number | undefined
      let post2Sent: number | undefined
      if (data.added > 0) {
        if (stageChoice !== 'post2') {
          const r = await fetch(`/api/admin/training-schedule/${schedule.id}/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'post1' }),
          }).then((res) => res.json()).catch(() => null)
          post1Sent = r?.sent
        }
        if (stageChoice !== 'post1') {
          const r = await fetch(`/api/admin/training-schedule/${schedule.id}/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: 'post2' }),
          }).then((res) => res.json()).catch(() => null)
          post2Sent = r?.sent
        }
      }

      setResult({ key: groupKey(g), added: data.added ?? 0, notFound: data.notFound ?? [], noEmail: data.noEmail ?? [], post1Sent, post2Sent })
      onScheduleCreated()
    } finally {
      setCreating(false)
    }
  }

  return (
    <SectionCard
      icon={History}
      title="Already Attended Trainings"
      description="Send Post-1 / Post-2 surveys retroactively for trainings already uploaded to Training Data — Pre-Training doesn't apply since the training already happened. Emails go out immediately when you create the schedule below, and daily reminders follow automatically until each person responds (reminders are on by default). This never touches Training Data or the Google Sheet mirror again — it's purely for tracking survey sends. Find it under Training Schedules below, in the &quot;Already Attended Trainings — Sent&quot; tab."
    >
      <div className="space-y-3">
        {groups.length > 5 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search training or Business Unit…"
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        )}

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-slate-400">No uploaded Training Data found yet.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((g) => {
              const key = groupKey(g)
              const isExpanded = expandedKey === key
              return (
                <div key={key} className="border border-slate-200 rounded-lg">
                  <button
                    onClick={() => expand(g)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{g.training}</p>
                      <p className="text-xs text-slate-500">
                        {g.businessUnits.length <= 2 ? g.businessUnits.join(', ') : `${g.businessUnits.length} Business Units`} · {g.month} {g.year} · {g.attendeeCount} attendee{g.attendeeCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-600">Attendees ({selected.size} of {g.attendees.length} selected)</p>
                        <div className="flex items-center gap-2 text-xs">
                          <button onClick={() => setSelected(new Set(g.attendees.map((a) => a.staffId)))} className="text-blue-600 hover:underline">Select all</button>
                          <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">Clear</button>
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                        {g.attendees.map((a) => (
                          <label key={a.staffId} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={selected.has(a.staffId)} onChange={() => toggleAttendee(a.staffId)} />
                            <span className="text-slate-700">{a.staffName}</span>
                            <span className="text-slate-400">{a.businessUnit}</span>
                            <span className="text-slate-400 ml-auto">{a.staffId}</span>
                          </label>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-xs text-slate-500">
                          Training start date
                          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
                        </label>
                        <label className="text-xs text-slate-500">
                          Training end date
                          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
                        </label>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Defaulted to the 1st of {g.month} {g.year} (the recorded month) — confirm or adjust to the actual training dates.
                      </p>

                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1.5">Surveys to send</p>
                        <div className="flex flex-wrap gap-1.5">
                          {([
                            ['both', 'Both (default)'],
                            ['post1', 'Post-1 only'],
                            ['post2', 'Post-2 only'],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setStageChoice(value)}
                              className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
                                stageChoice === value ? 'bg-navy-600 text-white border-navy-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" checked={remindersEnabled} onChange={(e) => setRemindersEnabled(e.target.checked)} />
                        Enable daily reminder nudges for this training (on by default)
                      </label>

                      {result && result.key === key && (
                        <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
                          <p className="text-emerald-700">
                            Added {result.added} attendee{result.added === 1 ? '' : 's'}.
                            {result.post1Sent !== undefined && ` Post-1 sent to ${result.post1Sent}.`}
                            {result.post2Sent !== undefined && ` Post-2 sent to ${result.post2Sent}.`}
                            {' '}Daily reminders will follow automatically until each person responds — see the &quot;Already Attended Trainings — Sent&quot; tab under Training Schedules below for status.
                          </p>
                          {result.notFound.length > 0 && <p className="text-amber-700">Not found in the roster: {result.notFound.join(', ')}</p>}
                          {result.noEmail.length > 0 && <p className="text-amber-700">No email on file: {result.noEmail.join(', ')}</p>}
                        </div>
                      )}

                      <button
                        onClick={() => createAndSend(g)}
                        disabled={creating || selected.size === 0 || !startDate || !endDate}
                        className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
                      >
                        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Create Schedule for {selected.size} Attendee{selected.size === 1 ? '' : 's'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
