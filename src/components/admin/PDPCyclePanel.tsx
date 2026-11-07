'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { RefreshCw, Plus, Send, Users, Loader2, Download, UserPlus, Trash2, BellOff, ChevronDown, ChevronUp, Search, X, XCircle, Mail, AlertTriangle, Eye, Pencil, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { usePagePermission } from '@/lib/use-page-permission'
import { exportPDPCycleExcel } from '@/lib/pdp-export'
import { PDPQuestionsEditor } from '@/components/admin/PDPQuestionsEditor'
import { PDPEmailTemplatesEditor } from '@/components/admin/PDPEmailTemplatesEditor'
import { PDPAnalysisPanel } from '@/components/admin/PDPAnalysisPanel'
import { Pagination, paginate } from '@/components/ui/Pagination'
import { normalizeStaffIdKey } from '@/lib/staff-id'

interface Cycle {
  id: string
  year: number
  title: string
  status: string
  expiryDays: number
  requireManagerValidation: boolean
  staffDeadline: string | null
  validationDeadline: string | null
  managerDeadline: string | null
  excludeDefaultCcOnReminders: boolean
  launchedAt: string | null
  _count: { staffSurveys: number; managerSurveys: number; managerOverrides: number }
}

interface Validation { id: string; managerName: string | null; email: string | null; respondedAt: string | null; answers: string | null; lastSendError: string | null }
interface StaffSurvey { id: string; staffId: string; staffName: string; email: string | null; businessUnit: string; sentAt: string | null; respondedAt: string | null; answers: string | null; validations: Validation[]; requireManagerValidation: boolean; lineManagerNames: string[]; rosterStatus: 'ok' | 'not-in-roster' | 'no-manager-on-file'; lastSendError: string | null }
interface TeamMember { id: string; staffId: string; staffName: string; businessUnit: string | null; status: string; needsReview: boolean; submittedAt: string | null; answers: string | null }
interface ManagerSurvey { id: string; managerStaffId: string; managerName: string; email: string | null; sentAt: string | null; respondedAt: string | null; rosterConfirmedAt: string | null; teamMembers: TeamMember[]; lastSendError: string | null }
interface Question { id: string; order: number; label: string; description: string | null; type: string; options: string | null; optionsSource: string | null; ratingMax: number; required: boolean; searchable: boolean; maxSelect: number | null }
interface Section { id: string; key: string; order: number; title: string; description: string | null; enabled: boolean; maxRepeats: number; questions: Question[] }
interface LaunchExclusion { staffId: string; staffName: string | null }
interface CycleDetail { cycle: Cycle; staffSurveys: StaffSurvey[]; managerSurveys: ManagerSurvey[]; overrides: { staffId: string; secondManagerStaffId: string }[]; sections: Section[]; staffExclusions: LaunchExclusion[]; managerExclusions: LaunchExclusion[] }

interface RosterStaff { staffId: string; name: string; email: string | null; businessUnit: string; department?: string | null; lineManagerStaffId?: string | null }
interface BusinessUnitOption { id: string; name: string }

type AudienceType = 'all' | 'businessUnit' | 'department' | 'selected'

// Same tick-state scheme as Survey Automation's response report (SurveyAutomationPanel.tsx):
// blue = sent and awaiting a response, emerald = filled, red = sent but past the reminder
// expiry and still unfilled, slate dash = never sent. Clicking a sent/expired tick re-sends
// (matches Survey Automation's "click the tick to send/resend" convention); a filled tick is
// informational only.
type TickState = 'unsent' | 'sent' | 'filled' | 'expired'
function tickState(sentAt: string | null, respondedAt: string | null, expiryDays: number): TickState {
  if (!sentAt) return 'unsent'
  if (respondedAt) return 'filled'
  if (Date.now() - new Date(sentAt).getTime() >= expiryDays * 86400000) return 'expired'
  return 'sent'
}
const TICK_STYLE: Record<TickState, string> = {
  unsent: 'text-slate-300 font-bold text-base',
  sent: 'text-blue-600 font-bold text-base',
  filled: 'text-emerald-600 font-bold text-base',
  expired: 'text-red-600 font-bold text-base',
}
const TICK_SYMBOL: Record<TickState, string> = { unsent: '—', sent: '✓', filled: '✓', expired: '✕' }

function AudiencePicker({
  label, businessUnits, roster, type, setType, value, setValue, selected, setSelected,
}: {
  label: string
  businessUnits: BusinessUnitOption[]
  roster: RosterStaff[]
  type: AudienceType
  setType: (t: AudienceType) => void
  value: string
  setValue: (v: string) => void
  selected: RosterStaff[]
  setSelected: (s: RosterStaff[]) => void
}) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const pickedIds = new Set(selected.map((p) => p.staffId))
    return roster.filter((r) => !pickedIds.has(r.staffId) && (r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q))).slice(0, 8)
  }, [query, roster, selected])

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <select value={type} onChange={(e) => setType(e.target.value as AudienceType)} className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs">
        <option value="all">Everyone</option>
        <option value="businessUnit">By Business Unit</option>
        <option value="department">By Department</option>
        <option value="selected">Specific people (for testing)</option>
      </select>
      {type === 'businessUnit' && (
        <select value={value} onChange={(e) => setValue(e.target.value)} className="block border border-slate-300 rounded-md px-2.5 py-1.5 text-xs w-full max-w-xs">
          <option value="">Select Business Unit…</option>
          {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
        </select>
      )}
      {type === 'department' && (
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Department name" className="block border border-slate-300 rounded-md px-2.5 py-1.5 text-xs w-full max-w-xs" />
      )}
      {type === 'selected' && (
        <div>
          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or Staff ID…"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.staffId}
                    type="button"
                    onClick={() => { setSelected([...selected, r]); setQuery('') }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <span>{r.name}</span>
                    <span className="text-slate-400">{r.staffId}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selected.map((p) => (
                <span key={p.staffId} className="inline-flex items-center gap-1.5 text-xs bg-navy-50 text-navy-700 rounded-full pl-2.5 pr-1.5 py-1">
                  {p.name}
                  <button type="button" onClick={() => setSelected(selected.filter((s) => s.staffId !== p.staffId))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Search-and-chips picker for "exclude these specific people from this (and every future) launch
// of this track" — the same search/chip mechanics as AudiencePicker's "Specific people" mode, but
// standalone (no audience type selector) since exclusion is an orthogonal filter applied on top of
// whatever audience type is chosen above it, not an audience type of its own. Persisted on the
// cycle (PDPLaunchExclusion) as each chip is added/removed, so this list survives a page reload
// and is pre-filled every time the Launch panel is reopened — it only changes when explicitly
// edited here.
function StaffExcludePicker({ roster, selected, onAdd, onRemove, busy }: { roster: RosterStaff[]; selected: RosterStaff[]; onAdd: (s: RosterStaff) => void; onRemove: (staffId: string) => void; busy: boolean }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const pickedIds = new Set(selected.map((p) => p.staffId))
    return roster.filter((r) => !pickedIds.has(r.staffId) && (r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q))).slice(0, 8)
  }, [query, roster, selected])

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <p className="text-[11px] font-medium text-slate-500">Exclude these people from this and every future launch of this track (saved — stays excluded until removed here)</p>
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or Staff ID…"
          disabled={busy}
          className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs disabled:opacity-50"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.staffId}
                type="button"
                onClick={() => { onAdd(r); setQuery('') }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
              >
                <span>{r.name}</span>
                <span className="text-slate-400">{r.staffId}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((p) => (
            <span key={p.staffId} className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-700 rounded-full pl-2.5 pr-1.5 py-1">
              {p.name}
              <button type="button" disabled={busy} onClick={() => onRemove(p.staffId)} className="disabled:opacity-50"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// One search box that resolves a roster person by name, Staff ID or email, same filter signature
// as StaffExcludePicker above — reused here twice (staff member, second manager) rather than
// building two slightly-different pickers.
function RosterPersonPicker({
  roster, picked, onPick, onClear, placeholder, disabled, exclude,
}: {
  roster: RosterStaff[]
  picked: RosterStaff | null
  onPick: (r: RosterStaff) => void
  onClear: () => void
  placeholder: string
  disabled?: boolean
  exclude?: Set<string>
}) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return roster
      .filter((r) => !exclude?.has(r.staffId) && (r.name.toLowerCase().includes(q) || r.staffId.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q)))
      .slice(0, 8)
  }, [query, roster, exclude])

  if (picked) {
    return (
      <div className="flex items-center justify-between border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1 bg-white">
        <span>{picked.name} <span className="text-slate-400">({picked.staffId})</span></span>
        <button type="button" onClick={onClear} className="text-slate-400 hover:text-red-600 shrink-0 ml-2"><X className="w-3.5 h-3.5" /></button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setQuery(''), 150)}
        placeholder={placeholder}
        disabled={disabled}
        className="block border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1 w-full disabled:opacity-50"
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button key={r.staffId} type="button" onMouseDown={() => onPick(r)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50">
              <div>{r.name}</div>
              <div className="text-slate-400">{r.staffId}{r.email ? ` · ${r.email}` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface StagedOverride { staffId: string; name: string; currentManagerName: string | null; secondManagerId: string; secondManagerName: string }

// Second Line Manager Exceptions — search-driven pick (name/Staff ID/email) instead of typing raw
// Staff IDs, shows the staff member's current (first) line manager once picked so the admin can
// confirm they're adding a SECOND one, batches picks into a staged list so several exceptions can
// be reviewed and saved together, and can be used both before and after Track A has been launched
// (see sendPDPManagerValidation in pdp-send.ts — it reads whichever overrides exist at the moment
// a staff member actually submits, not at launch time, so adding/editing after launch is safe as
// long as it happens before that particular person submits).
function SecondManagerOverridesPanel({
  roster, overrides, onSaveBatch, onRemove, busy, error,
}: {
  roster: RosterStaff[]
  overrides: { staffId: string; secondManagerStaffId: string }[]
  onSaveBatch: (pairs: { staffId: string; secondManagerStaffId: string }[]) => Promise<void>
  onRemove: (staffId: string) => Promise<void>
  busy: boolean
  error: string
}) {
  const byId = useMemo(() => new Map(roster.map((r) => [r.staffId, r])), [roster])
  const [pickedStaff, setPickedStaff] = useState<RosterStaff | null>(null)
  const [pickedManager, setPickedManager] = useState<RosterStaff | null>(null)
  const [staged, setStaged] = useState<StagedOverride[]>([])

  const currentManager = pickedStaff?.lineManagerStaffId ? byId.get(pickedStaff.lineManagerStaffId) ?? null : null

  const addToList = () => {
    if (!pickedStaff || !pickedManager) return
    setStaged((prev) => [
      ...prev.filter((s) => s.staffId !== pickedStaff.staffId),
      { staffId: pickedStaff.staffId, name: pickedStaff.name, currentManagerName: currentManager?.name ?? null, secondManagerId: pickedManager.staffId, secondManagerName: pickedManager.name },
    ])
    setPickedStaff(null)
    setPickedManager(null)
  }

  const saveAll = async () => {
    if (staged.length === 0) return
    await onSaveBatch(staged.map((s) => ({ staffId: s.staffId, secondManagerStaffId: s.secondManagerId })))
    setStaged([])
  }

  const startEdit = (staffId: string, secondManagerStaffId: string) => {
    setPickedStaff(byId.get(staffId) ?? null)
    setPickedManager(byId.get(secondManagerStaffId) ?? null)
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
        <label className="text-xs text-slate-500">
          Staff member
          <RosterPersonPicker roster={roster} picked={pickedStaff} onPick={setPickedStaff} onClear={() => setPickedStaff(null)} placeholder="Search name, Staff ID or email…" />
        </label>
        <div className="text-xs text-slate-500">
          Current line manager
          <div className="mt-1 px-2.5 py-1.5 border border-slate-200 rounded-md bg-slate-50 text-slate-600 min-h-[34px] flex items-center">
            {pickedStaff ? (currentManager?.name ?? 'Not on file') : '—'}
          </div>
        </div>
        <label className="text-xs text-slate-500">
          Second manager
          <RosterPersonPicker
            roster={roster} picked={pickedManager} onPick={setPickedManager} onClear={() => setPickedManager(null)}
            placeholder="Search name, Staff ID or email…" disabled={!pickedStaff}
            exclude={pickedStaff ? new Set([pickedStaff.staffId]) : undefined}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={addToList}
        disabled={!pickedStaff || !pickedManager}
        className="mt-2 flex items-center gap-1.5 text-xs font-medium text-navy-700 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 disabled:opacity-40"
      >
        <Plus className="w-3.5 h-3.5" /> Add to list
      </button>

      {staged.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[11px] font-medium text-slate-500">Ready to save ({staged.length})</p>
          {staged.map((s) => (
            <div key={s.staffId} className="flex items-center justify-between text-xs bg-navy-50 border border-navy-200 rounded-lg px-3 py-1.5">
              <span>{s.name} ({s.staffId}) — current manager: {s.currentManagerName ?? 'none on file'} → second manager: {s.secondManagerName}</span>
              <button type="button" onClick={() => setStaged((prev) => prev.filter((x) => x.staffId !== s.staffId))} className="text-slate-400 hover:text-red-600 shrink-0 ml-2"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={saveAll} disabled={busy} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Save {staged.length} exception{staged.length > 1 ? 's' : ''}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {overrides.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-[11px] font-medium text-slate-500">Saved exceptions ({overrides.length})</p>
          {overrides.map((o) => {
            const staff = byId.get(o.staffId)
            const mgr = byId.get(o.secondManagerStaffId)
            const current = staff?.lineManagerStaffId ? byId.get(staff.lineManagerStaffId) ?? null : null
            return (
              <div key={o.staffId} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <span>
                  {staff?.name ?? o.staffId} <span className="text-slate-400">({o.staffId})</span> — current manager: {current?.name ?? 'none on file'} → second manager: {mgr?.name ?? o.secondManagerStaffId}
                </span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <button type="button" onClick={() => startEdit(o.staffId, o.secondManagerStaffId)} className="text-slate-400 hover:text-navy-600" title="Edit — reselect above, Add to list, then Save">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => onRemove(o.staffId)} disabled={busy} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BreakdownTable({ title, rows }: { title: string; rows: { name: string; total: number; launched: number; filled: number; excluded: number }[] }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-slate-600 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-slate-400">No roster data to break down.</p>
      ) : (
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-slate-100 sticky top-0 bg-white">
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2 text-right">Total Staff</th>
                <th className="py-1 pr-2 text-right">Excluded</th>
                <th className="py-1 pr-2 text-right">Launched</th>
                <th className="py-1 pr-2 text-right">Filled</th>
                <th className="py-1 text-right">Completion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rate = r.total > 0 ? Math.round((r.filled / r.total) * 100) : 0
                return (
                  <tr key={r.name} className="border-b border-slate-50 last:border-0">
                    <td className="py-1 pr-2 text-slate-700">{r.name}</td>
                    <td className="py-1 pr-2 text-right text-slate-500">{r.total}</td>
                    <td className="py-1 pr-2 text-right text-slate-400">{r.excluded || '—'}</td>
                    <td className="py-1 pr-2 text-right text-slate-500">{r.launched}</td>
                    <td className="py-1 pr-2 text-right text-slate-500">{r.filled}</td>
                    <td className={`py-1 text-right font-medium ${rate >= 80 ? 'text-emerald-600' : rate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-1.5">Total Staff = everyone currently active here, company-wide, minus anyone excluded from Track A for this cycle. Completion = Filled ÷ Total Staff.</p>
    </div>
  )
}

export function PDPCyclePanel() {
  const { canAdmin, canExport } = usePagePermission()
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CycleDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [roster, setRoster] = useState<RosterStaff[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1)
  const [newTitle, setNewTitle] = useState('')
  const [newExpiry, setNewExpiry] = useState('30')
  const [creating, setCreating] = useState(false)

  const [staffAudienceType, setStaffAudienceType] = useState<AudienceType>('all')
  const [staffAudienceValue, setStaffAudienceValue] = useState('')
  const [staffAudienceSelected, setStaffAudienceSelected] = useState<RosterStaff[]>([])
  const [staffExcludeSelected, setStaffExcludeSelected] = useState<RosterStaff[]>([])
  const [staffRequireValidation, setStaffRequireValidation] = useState(true)
  const [managerAudienceType, setManagerAudienceType] = useState<AudienceType>('all')
  const [managerAudienceValue, setManagerAudienceValue] = useState('')
  const [managerAudienceSelected, setManagerAudienceSelected] = useState<RosterStaff[]>([])
  const [managerExcludeSelected, setManagerExcludeSelected] = useState<RosterStaff[]>([])
  const [exclusionBusy, setExclusionBusy] = useState(false)

  const [launchingStaff, setLaunchingStaff] = useState(false)
  const [launchProgress, setLaunchProgress] = useState<string | null>(null)
  const [launchingManagers, setLaunchingManagers] = useState(false)
  const [launchResult, setLaunchResult] = useState<{ track: string; created: number; sent: number; skipped: { name: string; reason: string }[]; removed?: number } | null>(null)

  const [savingOverride, setSavingOverride] = useState(false)
  const [overrideError, setOverrideError] = useState('')

  const [exporting, setExporting] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const [showEmailTemplates, setShowEmailTemplates] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showReminderSettings, setShowReminderSettings] = useState(false)
  const [reminderDraft, setReminderDraft] = useState<{ expiryDays: string; staffDeadline: string; validationDeadline: string; managerDeadline: string; excludeDefaultCcOnReminders: boolean } | null>(null)
  const [savingReminderSettings, setSavingReminderSettings] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showDeliveryIssues, setShowDeliveryIssues] = useState(false)
  const [reportQuery, setReportQuery] = useState('')
  type FillStatusFilter = 'all' | 'filled' | 'sent-unfilled' | 'unsent'
  const [reportStatusFilter, setReportStatusFilter] = useState<FillStatusFilter>('all')
  const [reportDateFrom, setReportDateFrom] = useState('')
  const [reportDateTo, setReportDateTo] = useState('')
  const [reportPage, setReportPage] = useState(1)
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [selectedStaffSurveyIds, setSelectedStaffSurveyIds] = useState<Set<string>>(new Set())
  const [selectedManagerSurveyIds, setSelectedManagerSurveyIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ sent?: number; deleted?: number; skipped?: { name: string; reason: string }[] } | null>(null)

  const [disablingAll, setDisablingAll] = useState(false)
  const [disableResult, setDisableResult] = useState<number | null>(null)
  const [sendingIgnoreEmail, setSendingIgnoreEmail] = useState(false)
  const [ignoreEmailResult, setIgnoreEmailResult] = useState<{ sent: number; skipped: { name: string; reason: string }[] } | null>(null)

  const [renamingCycle, setRenamingCycle] = useState(false)
  const [cycleRenameDraft, setCycleRenameDraft] = useState('')
  const [savingCycleRename, setSavingCycleRename] = useState(false)
  const [confirmDeleteCycle, setConfirmDeleteCycle] = useState(false)
  const [deleteCycleConfirmText, setDeleteCycleConfirmText] = useState('')
  const [deletingCycle, setDeletingCycle] = useState(false)

  const loadCycles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/pdp')
      const data = await res.json()
      setCycles(Array.isArray(data) ? data : [])
      if (Array.isArray(data) && data.length > 0 && !selectedId) setSelectedId(data[0].id)
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/pdp/${id}`)
      setDetail(await res.json())
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => { loadCycles() }, [loadCycles])
  useEffect(() => { if (selectedId) loadDetail(selectedId) }, [selectedId, loadDetail])
  useEffect(() => { setReportPage(1) }, [reportQuery, reportStatusFilter, reportDateFrom, reportDateTo])
  // Seeds the Launch-time checkbox from the cycle's stored default the first time its detail
  // loads — purely a convenience starting point; the admin can still flip it per launch, and
  // what's actually sent is whatever the checkbox shows when Launch Track A is clicked.
  useEffect(() => { if (detail) setStaffRequireValidation(detail.cycle.requireManagerValidation) }, [detail?.cycle.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!detail) return
    const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
    setReminderDraft({
      expiryDays: String(detail.cycle.expiryDays),
      staffDeadline: toDateInput(detail.cycle.staffDeadline),
      validationDeadline: toDateInput(detail.cycle.validationDeadline),
      managerDeadline: toDateInput(detail.cycle.managerDeadline),
      excludeDefaultCcOnReminders: detail.cycle.excludeDefaultCcOnReminders,
    })
  }, [detail?.cycle.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Seeds the exclude-picker chips from what's actually saved on the cycle (PDPLaunchExclusion),
  // not an empty array — this is what makes the exclusion list survive a reload.
  useEffect(() => {
    if (!detail) return
    const toRosterStaff = (e: LaunchExclusion): RosterStaff => ({ staffId: e.staffId, name: e.staffName || e.staffId, email: null, businessUnit: '' })
    setStaffExcludeSelected(detail.staffExclusions.map(toRosterStaff))
    setManagerExcludeSelected(detail.managerExclusions.map(toRosterStaff))
  }, [detail?.cycle.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetch('/api/admin/roster-directory').then((r) => r.json()).then((d) => setRoster(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/business-units').then((r) => r.json()).then((d) => setBusinessUnits(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const createCycle = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/pdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: newYear, title: newTitle, expiryDays: newExpiry ? Number(newExpiry) : 30 }),
      })
      const cycle = await res.json()
      if (res.ok) {
        setShowCreate(false)
        setNewTitle('')
        setNewExpiry('30')
        await loadCycles()
        setSelectedId(cycle.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const startRenameCycle = () => {
    if (!detail) return
    setCycleRenameDraft(detail.cycle.title)
    setRenamingCycle(true)
  }
  const saveCycleRename = async () => {
    if (!selectedId || !cycleRenameDraft.trim()) return
    setSavingCycleRename(true)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cycleRenameDraft.trim() }),
      })
      if (res.ok) {
        setRenamingCycle(false)
        await loadCycles()
        await loadDetail(selectedId)
      }
    } finally {
      setSavingCycleRename(false)
    }
  }

  // Irreversible — deletes the cycle and everything under it (sections, questions, every staff
  // and manager survey, including already-submitted plans). Gated behind typing the cycle's exact
  // title, not just a click, since this can't be undone.
  const deleteCycle = async () => {
    if (!selectedId || !detail || deleteCycleConfirmText !== detail.cycle.title) return
    setDeletingCycle(true)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}`, { method: 'DELETE' })
      if (res.ok) {
        setConfirmDeleteCycle(false)
        setDeleteCycleConfirmText('')
        setSelectedId(null)
        setDetail(null)
        await loadCycles()
      }
    } finally {
      setDeletingCycle(false)
    }
  }

  const buildAudience = (type: AudienceType, value: string, selected: RosterStaff[], exclude: RosterStaff[] = []) => {
    const excludeStaffIds = exclude.length > 0 ? exclude.map((s) => s.staffId) : undefined
    if (type === 'businessUnit') return { type, value, excludeStaffIds }
    if (type === 'department') return { type, value, excludeStaffIds }
    if (type === 'selected') return { type, value: selected.map((s) => s.staffId), excludeStaffIds }
    return { type: 'all' as const, excludeStaffIds }
  }

  // Batched, client-driven (same shape and reasoning as the Training Catalog admin actions) — an
  // audience of hundreds means hundreds of sequential SMTP sends, which in one request risks
  // tripping the serverless function's time limit and leaving the button spinning with no
  // response ever coming back. The FIRST call creates every PDPStaffSurvey row for the audience
  // (cheap, idempotent); every call (including the first) also sends one small batch of emails,
  // so progress is visible immediately rather than after a separate slow "create" phase.
  const launchStaff = async () => {
    if (!selectedId) return
    setLaunchingStaff(true)
    setLaunchResult(null)
    setLaunchProgress('Starting…')
    const audience = buildAudience(staffAudienceType, staffAudienceValue, staffAudienceSelected, staffExcludeSelected)
    const LAUNCH_BATCH_SIZE = 25
    let offset = 0
    let createdTotal = 0
    let sentTotal = 0
    let removedTotal = 0
    const skippedTotal: { name: string; reason: string }[] = []
    let batchNum = 0
    try {
      while (true) {
        const res = await fetch(`/api/admin/pdp/${selectedId}/launch-staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audience, requireManagerValidation: staffRequireValidation, batch: true, offset, limit: LAUNCH_BATCH_SIZE }),
        })
        const data = await res.json()
        if (!res.ok) { alert(data.error || 'Failed to launch.'); break }
        batchNum += 1
        createdTotal += data.created || 0
        sentTotal += data.sent || 0
        removedTotal += data.removed || 0
        skippedTotal.push(...(data.skipped || []))
        const total = typeof data.total === 'number' ? data.total : 0
        const totalBatches = total > 0 ? Math.ceil(total / LAUNCH_BATCH_SIZE) : batchNum
        setLaunchProgress(`Batch ${batchNum} of ${totalBatches} complete — ${sentTotal} sent, ${skippedTotal.length} skipped so far (${Math.min(offset + LAUNCH_BATCH_SIZE, total)} / ${total} processed).`)
        offset = typeof data.nextOffset === 'number' ? data.nextOffset : offset + LAUNCH_BATCH_SIZE
        if (data.done) break
      }
      setLaunchResult({ track: 'Staff Self-Fill', created: createdTotal, sent: sentTotal, skipped: skippedTotal, removed: removedTotal })
      setLaunchProgress(null)
      setStaffAudienceSelected([])
      await loadCycles()
      await loadDetail(selectedId)
    } finally {
      setLaunchingStaff(false)
    }
  }

  const launchManagers = async () => {
    if (!selectedId) return
    setLaunchingManagers(true)
    setLaunchResult(null)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/launch-managers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience: buildAudience(managerAudienceType, managerAudienceValue, managerAudienceSelected, managerExcludeSelected) }),
      })
      const data = await res.json()
      if (res.ok) {
        setLaunchResult({ track: 'Manager Team-Fill', ...data })
        setManagerAudienceSelected([])
      } else {
        alert(data.error || 'Failed to launch.')
      }
      await loadCycles()
      await loadDetail(selectedId)
    } finally {
      setLaunchingManagers(false)
    }
  }

  const addExclusion = async (track: 'staff' | 'manager', staff: RosterStaff) => {
    if (!selectedId) return
    setExclusionBusy(true)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/exclusions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track, staffId: staff.staffId }),
      })
      if (res.ok) {
        if (track === 'staff') setStaffExcludeSelected((prev) => [...prev, staff])
        else setManagerExcludeSelected((prev) => [...prev, staff])
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to exclude.')
      }
    } finally {
      setExclusionBusy(false)
    }
  }

  const removeExclusion = async (track: 'staff' | 'manager', staffId: string) => {
    if (!selectedId) return
    setExclusionBusy(true)
    try {
      await fetch(`/api/admin/pdp/${selectedId}/exclusions?track=${track}&staffId=${encodeURIComponent(staffId)}`, { method: 'DELETE' })
      if (track === 'staff') setStaffExcludeSelected((prev) => prev.filter((s) => s.staffId !== staffId))
      else setManagerExcludeSelected((prev) => prev.filter((s) => s.staffId !== staffId))
    } finally {
      setExclusionBusy(false)
    }
  }

  const saveOverrideBatch = async (pairs: { staffId: string; secondManagerStaffId: string }[]) => {
    if (!selectedId || pairs.length === 0) return
    setSavingOverride(true)
    setOverrideError('')
    try {
      for (const p of pairs) {
        const res = await fetch(`/api/admin/pdp/${selectedId}/overrides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setOverrideError(data.error || `Failed to add exception for ${p.staffId}.`); return }
      }
      await loadDetail(selectedId)
    } finally {
      setSavingOverride(false)
    }
  }

  const removeOverride = async (staffId: string) => {
    if (!selectedId) return
    setSavingOverride(true)
    try {
      await fetch(`/api/admin/pdp/${selectedId}/overrides?staffId=${encodeURIComponent(staffId)}`, { method: 'DELETE' })
      await loadDetail(selectedId)
    } finally {
      setSavingOverride(false)
    }
  }

  const downloadExcel = async () => {
    if (!detail) return
    setExporting(true)
    try {
      await exportPDPCycleExcel(detail.cycle.title, detail.sections, detail.staffSurveys, detail.managerSurveys)
    } finally {
      setExporting(false)
    }
  }

  const stopReminders = async (kind: 'staff-survey' | 'validation' | 'manager-survey', id: string) => {
    if (!selectedId) return
    setStoppingId(id)
    try {
      await fetch(`/api/admin/pdp/${kind}/${id}/stop-reminders`, { method: 'POST' })
      await loadDetail(selectedId)
    } finally {
      setStoppingId(null)
    }
  }

  const sendOrResendStaffSurvey = async (id: string) => {
    if (!selectedId) return
    setSendingId(id)
    try {
      await fetch('/api/admin/pdp/staff-survey/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', ids: [id] }),
      })
      await loadDetail(selectedId)
    } finally {
      setSendingId(null)
    }
  }

  const sendOrResendManagerSurvey = async (id: string) => {
    if (!selectedId) return
    setSendingId(id)
    try {
      await fetch('/api/admin/pdp/manager-survey/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', ids: [id] }),
      })
      await loadDetail(selectedId)
    } finally {
      setSendingId(null)
    }
  }

  const deleteStaffSurvey = async (id: string, name: string) => {
    if (!selectedId) return
    if (!confirm(`Delete ${name}'s Track A link? If they already submitted, their answers (and any manager validation) are removed too. This cannot be undone.`)) return
    setDeletingId(id)
    try {
      await fetch(`/api/admin/pdp/staff-survey/${id}`, { method: 'DELETE' })
      setSelectedStaffSurveyIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      await loadDetail(selectedId)
    } finally {
      setDeletingId(null)
    }
  }

  const deleteManagerSurvey = async (id: string, name: string) => {
    if (!selectedId) return
    if (!confirm(`Delete ${name}'s Track B link? Any team member answers already filled under it are removed too. This cannot be undone.`)) return
    setDeletingId(id)
    try {
      await fetch(`/api/admin/pdp/manager-survey/${id}`, { method: 'DELETE' })
      setSelectedManagerSurveyIds((prev) => { const next = new Set(prev); next.delete(id); return next })
      await loadDetail(selectedId)
    } finally {
      setDeletingId(null)
    }
  }

  const bulkStaffAction = async (action: 'delete' | 'resend') => {
    if (!selectedId || selectedStaffSurveyIds.size === 0) return
    if (action === 'delete' && !confirm(`Delete ${selectedStaffSurveyIds.size} selected Track A link(s)? This cannot be undone.`)) return
    if (action === 'resend' && !confirm(`Resend the Track A email to ${selectedStaffSurveyIds.size} selected person/people now?`)) return
    setBulkBusy(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/admin/pdp/staff-survey/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [...selectedStaffSurveyIds] }),
      })
      const data = await res.json()
      if (res.ok) { setBulkResult(data); setSelectedStaffSurveyIds(new Set()) }
      else alert(data.error || 'Failed.')
      await loadDetail(selectedId)
    } finally {
      setBulkBusy(false)
    }
  }

  const saveReminderSettings = async () => {
    if (!selectedId || !reminderDraft) return
    setSavingReminderSettings(true)
    try {
      await fetch(`/api/admin/pdp/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiryDays: Number(reminderDraft.expiryDays) || 30,
          staffDeadline: reminderDraft.staffDeadline || null,
          validationDeadline: reminderDraft.validationDeadline || null,
          managerDeadline: reminderDraft.managerDeadline || null,
          excludeDefaultCcOnReminders: reminderDraft.excludeDefaultCcOnReminders,
        }),
      })
      await loadDetail(selectedId)
    } finally {
      setSavingReminderSettings(false)
    }
  }

  const sendValidationEmails = async (ids: string[]) => {
    if (!selectedId || ids.length === 0) return
    if (!confirm(`Send/resend the manager validation email for ${ids.length} selected submitted plan(s)? Safe to use even if some already have it sent — those are skipped.`)) return
    setBulkBusy(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/admin/pdp/staff-survey/send-validations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (res.ok) { setBulkResult(data); setSelectedStaffSurveyIds(new Set()) }
      else alert(data.error || 'Failed.')
      await loadDetail(selectedId)
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkManagerAction = async (action: 'delete' | 'resend') => {
    if (!selectedId || selectedManagerSurveyIds.size === 0) return
    if (action === 'delete' && !confirm(`Delete ${selectedManagerSurveyIds.size} selected Track B link(s)? This cannot be undone.`)) return
    if (action === 'resend' && !confirm(`Resend the Track B email to ${selectedManagerSurveyIds.size} selected manager(s) now?`)) return
    setBulkBusy(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/admin/pdp/manager-survey/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [...selectedManagerSurveyIds] }),
      })
      const data = await res.json()
      if (res.ok) { setBulkResult(data); setSelectedManagerSurveyIds(new Set()) }
      else alert(data.error || 'Failed.')
      await loadDetail(selectedId)
    } finally {
      setBulkBusy(false)
    }
  }

  const disableAllManagerLinks = async () => {
    if (!selectedId) return
    if (!confirm('Disable every not-yet-completed Track B manager link for this cycle? Anyone who already finished is left untouched. This cannot be undone from here.')) return
    setDisablingAll(true)
    setDisableResult(null)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/manager-survey/disable-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: "This link has been disabled. The email \"2027 PDP: Your Team's Development Plans\" was sent in error during internal testing. Please disregard it, no action is needed on your part. Full details on the 2027 Personal Development Plan process, including when you'll be asked to complete it for your team, will be shared with you separately. We apologise for the confusion." }),
      })
      const data = await res.json()
      if (res.ok) setDisableResult(data.disabled)
      else alert(data.error || 'Failed to disable links.')
      await loadDetail(selectedId)
    } finally {
      setDisablingAll(false)
    }
  }

  const sendIgnoreEmail = async () => {
    if (!selectedId) return
    if (!confirm("Send the 'please disregard' email to every manager who received the Track B launch email for this cycle (skipping anyone no longer active on the roster)? This sends real email right now.")) return
    setSendingIgnoreEmail(true)
    setIgnoreEmailResult(null)
    try {
      const res = await fetch(`/api/admin/pdp/${selectedId}/manager-survey/send-ignore-email`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) setIgnoreEmailResult(data)
      else alert(data.error || 'Failed to send.')
    } finally {
      setSendingIgnoreEmail(false)
    }
  }

  // Someone currently on the exclusion list should never be counted or shown anywhere in Track
  // A's numbers or the Response Report below — even if a PDPStaffSurvey row still physically
  // exists for them (e.g. they were excluded sometime after an earlier launch already created
  // it; that row gets actually cleaned up the next time Launch Track A runs with audience
  // "Everyone" — see sendPDPStaffSurvey's reconciliation — but the display shouldn't wait on
  // that to be correct).
  // No-email people are NOT filtered out here — they stay counted in the denominator (358 =
  // 366 active − 8 excluded; confirmed explicitly against the admin's own expected figure) and
  // stay listed in the Response Report, since they're still genuinely eligible, just missing
  // contact info — which is exactly what Delivery Issues (below) exists to flag so it gets fixed.
  const excludedStaffIdKeys = new Set((detail?.staffExclusions ?? []).map((e) => normalizeStaffIdKey(e.staffId)))
  const eligibleStaffSurveys = (detail?.staffSurveys ?? []).filter((s) => !excludedStaffIdKeys.has(normalizeStaffIdKey(s.staffId)))

  const selfSubmitted = eligibleStaffSurveys.filter((s) => s.respondedAt).length
  const selfTotal = eligibleStaffSurveys.length
  // Distinct from "Filled" above — this is the actual delivery count (sentAt set), which is what
  // answers "did everyone receive the email" (the big Filled/Total number does NOT answer that —
  // it's how many have submitted so far, which starts at 0 right after a launch regardless of how
  // many emails went out).
  const selfSent = eligibleStaffSurveys.filter((s) => s.sentAt).length
  const selfNoEmail = eligibleStaffSurveys.filter((s) => !s.email).length
  const selfSendFailed = eligibleStaffSurveys.filter((s) => s.email && !s.sentAt).length
  const managerLinksSent = detail?.managerSurveys.filter((m) => m.sentAt).length ?? 0
  // Whichever manager-review mechanism actually applies per person, not just the old
  // one-link-per-person PDPManagerValidation flow — new submissions go through the one-link-
  // per-manager flow instead (a PDPManagerTeamMemberEntry with needsReview: true), which never
  // creates a PDPManagerValidation row at all. Used both for the stats above and for the Response
  // Report's "Manager Validation(s)" column, which previously only ever read s.validations and so
  // showed "—" forever for anyone reviewed through the new flow, even once actually completed.
  const needsReviewEntriesByStaffId = new Map<string, { managerName: string; submittedAt: string | null }[]>()
  for (const m of detail?.managerSurveys ?? []) {
    for (const t of m.teamMembers) {
      if (!t.needsReview) continue
      const arr = needsReviewEntriesByStaffId.get(t.staffId) ?? []
      arr.push({ managerName: m.managerName, submittedAt: t.submittedAt })
      needsReviewEntriesByStaffId.set(t.staffId, arr)
    }
  }
  const reviewCompleteStaffIds = new Set(
    [...needsReviewEntriesByStaffId.entries()].filter(([, entries]) => entries.some((e) => e.submittedAt)).map(([staffId]) => staffId),
  )
  const needsValidationSurveys = eligibleStaffSurveys.filter((s) => s.requireManagerValidation)
  const validationsTotal = needsValidationSurveys.length
  const validationsSubmitted = needsValidationSurveys.filter(
    (s) => s.validations.some((v) => v.respondedAt) || reviewCompleteStaffIds.has(s.staffId),
  ).length
  const teamMembersSubmitted = detail?.managerSurveys.reduce((s, m) => s + m.teamMembers.filter((t) => t.submittedAt).length, 0) ?? 0
  const teamMembersTotal = detail?.managerSurveys.reduce((s, m) => s + m.teamMembers.filter((t) => t.status === 'accepted' || t.status === 'added').length, 0) ?? 0
  const teamMembersPendingRoster = detail?.managerSurveys.reduce((s, m) => s + m.teamMembers.filter((t) => t.status === 'pending').length, 0) ?? 0

  // Everyone who never got their email, across all three tracks — either because there's no
  // address on file at all, or because the send itself failed (malformed/nonexistent address
  // rejected by the SMTP server, etc. — see PDPStaffSurvey.lastSendError). Deliberately excludes
  // anyone with sentAt already set: once a send has succeeded at least once, a LATER reminder
  // failure still shows here via lastSendError, but is labeled differently so "never reached them
  // at all" isn't confused with "they have it, a later nudge just hiccuped."
  type DeliveryIssue = { track: string; name: string; staffId: string; email: string | null; reason: string; neverSent: boolean }
  const deliveryIssues: DeliveryIssue[] = []
  for (const s of eligibleStaffSurveys) {
    if (!s.email) deliveryIssues.push({ track: 'Track A', name: s.staffName, staffId: s.staffId, email: null, reason: 'No email address on file.', neverSent: true })
    else if (s.lastSendError) deliveryIssues.push({ track: 'Track A', name: s.staffName, staffId: s.staffId, email: s.email, reason: s.lastSendError, neverSent: !s.sentAt })
    for (const v of s.validations) {
      if (!v.email) deliveryIssues.push({ track: 'Manager Validation', name: v.managerName || 'Manager', staffId: s.staffId, email: null, reason: `No email address on file (reviewing ${s.staffName}'s plan).`, neverSent: true })
      else if (v.lastSendError) deliveryIssues.push({ track: 'Manager Validation', name: v.managerName || 'Manager', staffId: s.staffId, email: v.email, reason: v.lastSendError, neverSent: !v.respondedAt })
    }
  }
  for (const m of detail?.managerSurveys ?? []) {
    if (!m.email) deliveryIssues.push({ track: 'Track B', name: m.managerName, staffId: m.managerStaffId, email: null, reason: 'No email address on file.', neverSent: true })
    else if (m.lastSendError) deliveryIssues.push({ track: 'Track B', name: m.managerName, staffId: m.managerStaffId, email: m.email, reason: m.lastSendError, neverSent: !m.sentAt })
  }

  // Reconciliation check for the Track A tile — computed independently from the SAME roster data
  // already loaded for this page, so a mismatch against selfTotal is visible rather than silently
  // trusted. Every Staff ID comparison here goes through normalizeStaffIdKey (not a plain
  // .toUpperCase()) — confirmed directly against a real case where it mattered: "MSBL-0108" (a
  // PDPStaffSurvey row, frozen at launch time) and "MSBL-108" (that same person's CURRENT roster
  // record, re-entered without zero-padding at some point since) are the same person, and a naive
  // string comparison was flagging 8 genuinely active, non-excluded people as an unaccounted
  // "roster gap" purely because of that formatting drift, when they were never actually a problem.
  const rosterEligible = roster.filter((r) => !excludedStaffIdKeys.has(normalizeStaffIdKey(r.staffId)))
  const rosterEligibleCount = rosterEligible.length
  const rosterEligibleNoEmail = rosterEligible.filter((r) => !r.email).length
  const totalReconcileGap = selfTotal - rosterEligibleCount
  // Named, not just counted — anyone with a (non-excluded) survey row whose Staff ID genuinely
  // doesn't resolve against the current active roster at all, even after normalizing.
  const rosterEligibleIdKeys = new Set(rosterEligible.map((r) => normalizeStaffIdKey(r.staffId)))
  const unaccountedStaffSurveys = totalReconcileGap > 0
    ? eligibleStaffSurveys.filter((s) => !rosterEligibleIdKeys.has(normalizeStaffIdKey(s.staffId)))
    : []
  // The other way a gap can exist even when EVERY row individually resolves to someone real: two
  // separate PDPStaffSurvey rows for the SAME person (one created under an old-format Staff ID
  // before a roster re-upload changed their spelling, one created fresh by a later launch under
  // the new spelling) — each one matches the roster fine on its own, so unaccountedStaffSurveys
  // above comes back empty, but together they double-count that one person. Grouping by the same
  // normalized key surfaces exactly that.
  const duplicateStaffSurveyGroups = totalReconcileGap > 0
    ? (() => {
        const byKey = new Map<string, StaffSurvey[]>()
        for (const s of eligibleStaffSurveys) {
          const key = normalizeStaffIdKey(s.staffId)
          const arr = byKey.get(key) ?? []
          arr.push(s)
          byKey.set(key, arr)
        }
        return [...byKey.values()].filter((group) => group.length > 1)
      })()
    : []

  // Each distinct reason among the "not yet delivered" (has email, send attempted, never
  // succeeded) group, with a few names each — the Delivery Issues panel further down has the full
  // list, but surfacing this right under the Track A tile means an admin doesn't have to go
  // hunting for WHY 19 people are stuck before they can fix the actual email addresses.
  const trackAFailures = deliveryIssues.filter((d) => d.track === 'Track A' && d.email)
  const trackAFailureGroups = (() => {
    const byReason = new Map<string, { name: string; email: string | null }[]>()
    for (const f of trackAFailures) {
      const list = byReason.get(f.reason) ?? []
      list.push({ name: f.name, email: f.email })
      byReason.set(f.reason, list)
    }
    return [...byReason.entries()].map(([reason, people]) => ({ reason, people })).sort((a, b) => b.people.length - a.people.length)
  })()

  // Completion rate by Business Unit and Department — denominator is every ACTIVE staff member
  // currently in that BU/department company-wide (the `roster` state, already active-only) MINUS
  // anyone on the Track A exclusion list, not just whoever this cycle happened to launch to, so
  // this reads as true org-wide coverage of the people actually EXPECTED to fill it — a BU with
  // several deliberate exclusions shouldn't read as having poor completion because of people who
  // were never supposed to get it. PDPStaffSurvey.department is never actually populated at launch
  // time (always written null — see sendPDPStaffSurvey), so department here is resolved live by
  // looking each survey's staffId up in `roster` instead of trusting that stored field.
  type TrackBreakdownRow = { name: string; total: number; launched: number; filled: number; excluded: number }
  const buildBreakdown = (groupKey: (s: RosterStaff) => string, surveyGroupKey: (s: StaffSurvey) => string): TrackBreakdownRow[] => {
    const totalBy = new Map<string, number>()
    const excludedBy = new Map<string, number>()
    for (const r of roster) {
      const k = groupKey(r) || 'Unassigned'
      if (excludedStaffIdKeys.has(normalizeStaffIdKey(r.staffId))) {
        excludedBy.set(k, (excludedBy.get(k) || 0) + 1)
        continue
      }
      totalBy.set(k, (totalBy.get(k) || 0) + 1)
    }
    const launchedBy = new Map<string, number>()
    const filledBy = new Map<string, number>()
    for (const s of eligibleStaffSurveys) {
      const k = surveyGroupKey(s) || 'Unassigned'
      if (s.sentAt) launchedBy.set(k, (launchedBy.get(k) || 0) + 1)
      if (s.respondedAt) filledBy.set(k, (filledBy.get(k) || 0) + 1)
    }
    const keys = new Set([...totalBy.keys(), ...launchedBy.keys(), ...filledBy.keys(), ...excludedBy.keys()])
    return [...keys]
      .map((k) => ({ name: k, total: totalBy.get(k) || 0, launched: launchedBy.get(k) || 0, filled: filledBy.get(k) || 0, excluded: excludedBy.get(k) || 0 }))
      .sort((a, b) => b.total - a.total)
  }
  const staffIdToDepartment = new Map(roster.filter((r) => r.department).map((r) => [normalizeStaffIdKey(r.staffId), r.department as string]))
  const buBreakdown = buildBreakdown((r) => r.businessUnit, (s) => s.businessUnit)
  const deptBreakdown = buildBreakdown((r) => r.department || '', (s) => staffIdToDepartment.get(normalizeStaffIdKey(s.staffId)) || '')

  const q = reportQuery.trim().toLowerCase()
  // Shared by both tables below — "filled" = respondedAt set, "sent, unfilled" = sentAt but no
  // respondedAt yet, "unsent" = never emailed. Date range filters by the fill date (respondedAt)
  // specifically, so it only matches people who HAVE filled, within that window — set together
  // with the status filter, or on its own.
  const matchesStatusAndDate = (sentAt: string | null, respondedAt: string | null) => {
    if (reportStatusFilter === 'filled' && !respondedAt) return false
    if (reportStatusFilter === 'sent-unfilled' && !(sentAt && !respondedAt)) return false
    if (reportStatusFilter === 'unsent' && sentAt) return false
    if ((reportDateFrom || reportDateTo) && !respondedAt) return false
    if (respondedAt) {
      const filledDate = respondedAt.slice(0, 10)
      if (reportDateFrom && filledDate < reportDateFrom) return false
      if (reportDateTo && filledDate > reportDateTo) return false
    }
    return true
  }
  const filteredStaffSurveys = detail ? eligibleStaffSurveys.filter((s) =>
    (!q || s.staffName.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q)) && matchesStatusAndDate(s.sentAt, s.respondedAt)
  ) : []
  const filteredManagerSurveys = detail ? detail.managerSurveys.filter((m) =>
    (!q || m.managerName.toLowerCase().includes(q) || m.managerStaffId.toLowerCase().includes(q)) && matchesStatusAndDate(m.sentAt, m.respondedAt)
  ) : []
  const REPORT_PAGE_SIZE = 50
  const pagedStaffSurveys = paginate(filteredStaffSurveys, reportPage, REPORT_PAGE_SIZE)

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Personal Development Plan"
        subtitle="Launch and track PDP campaigns — staff self-fill and manager team-fill, both pre-filled from existing training data"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={loadCycles} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            {canAdmin && (
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700">
                <Plus className="w-3.5 h-3.5" /> New Cycle
              </button>
            )}
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">
        {showCreate && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-800">New PDP Cycle</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs text-slate-500">
                Year
                <input type="number" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
              </label>
              <label className="text-xs text-slate-500 sm:col-span-2">
                Title
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={`${newYear} Personal Development Plan`} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <label className="text-xs text-slate-500">
                Reminders stop after (days unfilled)
                <input type="number" min={1} value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
              </label>
            </div>
            <p className="text-[11px] text-slate-400">A default set of sections and questions (matching the 2027 PDP template) is added automatically — edit them below once the cycle is created.</p>
            <div className="flex items-center gap-2">
              <button onClick={createCycle} disabled={creating} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create
              </button>
              <button onClick={() => setShowCreate(false)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : cycles.length === 0 ? (
          <AlertBadge variant="info" message="No PDP cycles yet — create one above to get started." />
        ) : (
          <div className="flex gap-2 flex-wrap">
            {cycles.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border ${selectedId === c.id ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-slate-600 border-slate-200 hover:border-navy-300'}`}
              >
                {c.title} <span className="opacity-70">({c.status})</span>
              </button>
            ))}
          </div>
        )}

        {canAdmin && detail && (
          <div className="flex items-center gap-2 flex-wrap">
            {renamingCycle ? (
              <>
                <input
                  value={cycleRenameDraft}
                  onChange={(e) => setCycleRenameDraft(e.target.value)}
                  className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm w-72"
                  autoFocus
                />
                <button onClick={saveCycleRename} disabled={savingCycleRename || !cycleRenameDraft.trim()} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                  {savingCycleRename ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save
                </button>
                <button onClick={() => setRenamingCycle(false)} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
              </>
            ) : (
              <button onClick={startRenameCycle} className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">
                <Pencil className="w-3.5 h-3.5" /> Rename Cycle
              </button>
            )}

            {!confirmDeleteCycle ? (
              <button onClick={() => setConfirmDeleteCycle(true)} className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">
                <Trash2 className="w-3.5 h-3.5" /> Delete Cycle
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-xs text-red-700">
                  This permanently deletes &quot;{detail.cycle.title}&quot; and every response under it. Type the cycle title to confirm:
                </p>
                <input
                  value={deleteCycleConfirmText}
                  onChange={(e) => setDeleteCycleConfirmText(e.target.value)}
                  placeholder={detail.cycle.title}
                  className="border border-red-300 rounded-md px-2.5 py-1.5 text-xs w-56"
                />
                <button
                  onClick={deleteCycle}
                  disabled={deletingCycle || deleteCycleConfirmText !== detail.cycle.title}
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingCycle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Confirm Delete
                </button>
                <button onClick={() => { setConfirmDeleteCycle(false); setDeleteCycleConfirmText('') }} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
              </div>
            )}
          </div>
        )}

        {loadingDetail ? (
          <p className="text-sm text-slate-400">Loading cycle…</p>
        ) : detail && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Track A — Self-Fill</p>
                <p className="text-2xl font-bold text-slate-800">{selfSubmitted} / {selfTotal} <span className="text-xs font-normal text-slate-400">filled</span></p>
                <p className={`text-xs mt-1 font-medium ${selfSendFailed > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  Emailed: {selfSent} / {selfTotal}
                  {selfSendFailed > 0 && <> · {selfSendFailed} not yet delivered — re-click Launch Track A to retry them</>}
                  {selfNoEmail > 0 && <> · {selfNoEmail} have no email on file (see Delivery Issues below)</>}
                </p>
                {trackAFailureGroups.length > 0 && (
                  <div className="mt-1.5 text-[11px] text-amber-700 space-y-0.5">
                    {trackAFailureGroups.map((g) => (
                      <p key={g.reason}>
                        <span className="font-medium">{g.people.length}×</span> &quot;{g.reason}&quot; — {g.people.slice(0, 4).map((p) => p.name).join(', ')}{g.people.length > 4 ? ` +${g.people.length - 4} more` : ''}
                      </p>
                    ))}
                  </div>
                )}
                {totalReconcileGap !== 0 && (
                  <div className="text-[11px] text-slate-400 mt-1.5 space-y-1">
                    <p>
                      Roster check: {roster.length} active − {excludedStaffIdKeys.size} excluded = {rosterEligibleCount} expected (of which {rosterEligibleNoEmail} have no email). This cycle&apos;s total is {selfTotal}
                      {totalReconcileGap > 0 ? `, ${totalReconcileGap} more than that.` : `, ${Math.abs(totalReconcileGap)} fewer — likely people removed from the roster since launch who haven't yet reconciled; relaunch to Everyone to clean this up.`}
                    </p>
                    {unaccountedStaffSurveys.length > 0 && (
                      <p>Staff ID doesn&apos;t match anyone currently in the active roster: {unaccountedStaffSurveys.slice(0, 8).map((s) => `${s.staffName} (${s.staffId})`).join(', ')}{unaccountedStaffSurveys.length > 8 ? ` +${unaccountedStaffSurveys.length - 8} more` : ''}.</p>
                    )}
                    {duplicateStaffSurveyGroups.length > 0 && (
                      <p>
                        {duplicateStaffSurveyGroups.length} {duplicateStaffSurveyGroups.length === 1 ? 'person has' : 'people have'} two survey records each (same person, under two differently-formatted Staff IDs — one from before a roster re-upload changed their spelling): {duplicateStaffSurveyGroups.slice(0, 6).map((g) => `${g[0].staffName} (${g.map((s) => s.staffId).join(' / ')})`).join('; ')}{duplicateStaffSurveyGroups.length > 6 ? `; +${duplicateStaffSurveyGroups.length - 6} more` : ''}. Relaunch Track A to Everyone to merge these.
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-1">Manager validations: {validationsSubmitted} / {validationsTotal}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Track B — Manager Team-Fill</p>
                <p className="text-2xl font-bold text-slate-800">{teamMembersSubmitted} / {teamMembersTotal} <span className="text-xs font-normal text-slate-400">filled</span></p>
                <p className="text-xs text-slate-400 mt-1">
                  {managerLinksSent} / {detail.managerSurveys.length} manager link(s) emailed
                  {teamMembersPendingRoster > 0 && <> · {teamMembersPendingRoster} team member(s) awaiting their manager&apos;s roster confirmation (not counted above yet)</>}
                </p>
              </div>
            </div>

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <button onClick={() => setShowReminderSettings((v) => !v)} className="w-full flex items-center justify-between text-left">
                  <p className="text-sm font-semibold text-slate-800">Reminders &amp; Deadlines</p>
                  {showReminderSettings ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showReminderSettings && reminderDraft && (
                  <div className="mt-4 space-y-4">
                    <label className="text-xs text-slate-500 block max-w-xs">
                      Daily reminders stop after (days unfilled)
                      <input
                        type="number" min={1} value={reminderDraft.expiryDays}
                        onChange={(e) => setReminderDraft({ ...reminderDraft, expiryDays: e.target.value })}
                        className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                      />
                      <span className="text-[11px] text-slate-400">Applies to all three tracks — reminders go out once a day (same cadence as Survey Automation) until the person responds or this many days have passed since their link was sent.</span>
                    </label>
                    <p className="text-[11px] text-slate-400">
                      The dates below are shown in each track&apos;s email as the actual deadline. Leave any of them blank to fall back to a rolling &quot;sent date + the days above&quot; date instead of a fixed one.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                      <label className="text-xs text-slate-500">
                        Self-Fill deadline (Track A)
                        <input type="date" value={reminderDraft.staffDeadline} onChange={(e) => setReminderDraft({ ...reminderDraft, staffDeadline: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
                      </label>
                      <label className="text-xs text-slate-500">
                        Line Manager Validation deadline
                        <input type="date" value={reminderDraft.validationDeadline} onChange={(e) => setReminderDraft({ ...reminderDraft, validationDeadline: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
                      </label>
                      <label className="text-xs text-slate-500">
                        Track B (Manager Team-Fill) deadline
                        <input type="date" value={reminderDraft.managerDeadline} onChange={(e) => setReminderDraft({ ...reminderDraft, managerDeadline: e.target.value })} className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1" />
                      </label>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={reminderDraft.excludeDefaultCcOnReminders}
                        onChange={(e) => setReminderDraft({ ...reminderDraft, excludeDefaultCcOnReminders: e.target.checked })}
                      />
                      Exclude the platform-wide Default Cc from the first email sent for each track (off by default). Daily reminder nudges never include the Default Cc, regardless of this setting.
                    </label>
                    <button onClick={saveReminderSettings} disabled={savingReminderSettings} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                      {savingReminderSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                    </button>
                  </div>
                )}
              </div>
            )}

            {canAdmin && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
                <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Emergency: Track B links sent in error
                </p>
                <p className="text-xs text-red-700">
                  Use this if Track B went out to the wrong audience by mistake. Disabling leaves the link clickable but shows a
                  &quot;please disregard&quot; message instead of the real form (anyone who already finished is untouched). Sending the follow-up
                  email reaches everyone who was actually sent the launch email, skipping anyone no longer active on the roster.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={disableAllManagerLinks} disabled={disablingAll} className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700 disabled:opacity-50">
                    {disablingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Disable All Unfinished Track B Links
                  </button>
                  <button onClick={sendIgnoreEmail} disabled={sendingIgnoreEmail} className="flex items-center gap-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100 disabled:opacity-50">
                    {sendingIgnoreEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Send &quot;Please Disregard&quot; Email to Managers
                  </button>
                </div>
                {disableResult !== null && <p className="text-xs text-emerald-700">Disabled {disableResult} link(s).</p>}
                {ignoreEmailResult && (
                  <div className="text-xs bg-white border border-red-100 rounded-lg px-3 py-2">
                    <p className="text-emerald-700">Sent successfully to {ignoreEmailResult.sent}.</p>
                    {ignoreEmailResult.skipped.length > 0 && (
                      <p className="text-amber-700 mt-1">Failed/skipped for {ignoreEmailResult.skipped.length}: {ignoreEmailResult.skipped.slice(0, 10).map((s) => `${s.name} (${s.reason})`).join('; ')}{ignoreEmailResult.skipped.length > 10 ? '…' : ''}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Launch</p>
                  <a
                    href={`/pdp/preview/${selectedId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50"
                  >
                    <Eye className="w-3.5 h-3.5" /> Preview Form
                  </a>
                </div>

                <AudiencePicker
                  label="Track A audience — who gets their own self-fill link"
                  businessUnits={businessUnits} roster={roster}
                  type={staffAudienceType} setType={setStaffAudienceType}
                  value={staffAudienceValue} setValue={setStaffAudienceValue}
                  selected={staffAudienceSelected} setSelected={setStaffAudienceSelected}
                />
                <StaffExcludePicker roster={roster} selected={staffExcludeSelected} onAdd={(s) => addExclusion('staff', s)} onRemove={(id) => removeExclusion('staff', id)} busy={exclusionBusy} />
                <label className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <input type="checkbox" checked={staffRequireValidation} onChange={(e) => setStaffRequireValidation(e.target.checked)} />
                  Require line manager review after this batch submits (on by default). Applies only to the people launched below — Track B managers skip this since they are the line manager already, and launching Track A again later can use a different setting.
                </label>
                <button onClick={launchStaff} disabled={launchingStaff} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                  {launchingStaff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Launch Track A (Staff Self-Fill)
                </button>
                {launchProgress && (
                  <div className="flex items-center gap-2 bg-navy-50 border border-navy-200 text-navy-700 rounded-lg px-3 py-2 text-xs font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    {launchProgress}
                  </div>
                )}

                <AudiencePicker
                  label="Track B audience — which managers get their team's link (filtered by the manager's own BU/department)"
                  businessUnits={businessUnits} roster={roster}
                  type={managerAudienceType} setType={setManagerAudienceType}
                  value={managerAudienceValue} setValue={setManagerAudienceValue}
                  selected={managerAudienceSelected} setSelected={setManagerAudienceSelected}
                />
                <StaffExcludePicker roster={roster} selected={managerExcludeSelected} onAdd={(s) => addExclusion('manager', s)} onRemove={(id) => removeExclusion('manager', id)} busy={exclusionBusy} />
                <button onClick={launchManagers} disabled={launchingManagers} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
                  {launchingManagers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                  Launch Track B (Manager Team-Fill)
                </button>

                <p className="text-[11px] text-slate-400">
                  Re-running either only sends to people/managers not already created for this cycle — safe to re-run with a wider audience later (e.g. test with a few people first, then launch to everyone). Launching Track A to &quot;Everyone&quot; also reconciles the total: anyone no longer active or now excluded, who never actually filled their plan, is removed, so the count stays an accurate match to the current roster instead of only ever growing.
                </p>
                {launchResult && (
                  <div className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-emerald-800 font-medium">{launchResult.track} launched — {launchResult.created} created, {launchResult.sent} sent{launchResult.removed ? `, ${launchResult.removed} stale/unanswered removed` : ''}.</p>
                      {launchResult.skipped.length > 0 && (
                        <p className="text-amber-700 mt-1 text-xs">{launchResult.skipped.length} skipped: {launchResult.skipped.slice(0, 5).map((s) => `${s.name} (${s.reason})`).join('; ')}{launchResult.skipped.length > 5 ? '…' : ''}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-slate-800 mb-1">Second Line Manager Exceptions</p>
                <p className="text-xs text-slate-500 mb-3">A staff member listed here gets a second, fully independent manager validation link — neither manager&apos;s answers overwrite the other.</p>
                <SecondManagerOverridesPanel
                  roster={roster}
                  overrides={detail.overrides}
                  onSaveBatch={saveOverrideBatch}
                  onRemove={removeOverride}
                  busy={savingOverride}
                  error={overrideError}
                />
                <p className="text-[11px] text-slate-500 mt-3">
                  Safe to add, edit or remove exceptions at any time, including after Track A has already been sent — a validation link is created using whoever is on this list at the moment a given staff member actually submits their plan, not at launch time.
                </p>
              </div>
            )}

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <button onClick={() => setShowQuestions((v) => !v)} className="w-full flex items-center justify-between text-left">
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    Questions — see and edit what respondents are asked
                    {detail.sections.length === 0 && <span className="text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">No sections — form is empty</span>}
                  </p>
                  {showQuestions ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showQuestions && (
                  <div className="mt-4">
                    <PDPQuestionsEditor cycle={detail.cycle} sections={detail.sections} onReload={() => loadDetail(selectedId!)} />
                  </div>
                )}
              </div>
            )}

            {canAdmin && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <button onClick={() => setShowEmailTemplates((v) => !v)} className="w-full flex items-center justify-between text-left">
                  <p className="text-sm font-semibold text-slate-800">Email Templates — edit the wording of every PDP email</p>
                  {showEmailTemplates ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showEmailTemplates && (
                  <div className="mt-4">
                    <PDPEmailTemplatesEditor cycleId={selectedId!} />
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <button onClick={() => setShowAnalysis((v) => !v)} className="w-full flex items-center justify-between text-left">
                <p className="text-sm font-semibold text-slate-800">Analysis — org-wide training plan from filled responses</p>
                {showAnalysis ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {showAnalysis && (
                <div className="mt-4">
                  <PDPAnalysisPanel cycleId={selectedId!} />
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <button onClick={() => setShowDeliveryIssues((v) => !v)} className="w-full flex items-center justify-between text-left">
                <p className="text-sm font-semibold text-slate-800">
                  Delivery Issues — who never got their email{deliveryIssues.length > 0 && <span className="ml-2 text-xs font-medium text-red-600">({deliveryIssues.length})</span>}
                </p>
                {showDeliveryIssues ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {showDeliveryIssues && (
                <div className="mt-4">
                  <p className="text-[11px] text-slate-400 mb-3">
                    No email on file is caught immediately. A send that outright failed (bad/nonexistent address, SMTP rejection) shows the error below.
                    This can&apos;t catch an address that LOOKS valid, gets accepted, and bounces later — this platform has no bounce-tracking for that case.
                  </p>
                  {deliveryIssues.length === 0 ? (
                    <p className="text-xs text-slate-400">No known delivery failures for this cycle.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-slate-100">
                            <th className="py-1.5 pr-3">Track</th>
                            <th className="py-1.5 pr-3">Name</th>
                            <th className="py-1.5 pr-3">Staff ID</th>
                            <th className="py-1.5 pr-3">Status</th>
                            <th className="py-1.5">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveryIssues.map((d, i) => (
                            <tr key={`${d.track}-${d.staffId}-${i}`} className="border-b border-slate-50 last:border-0">
                              <td className="py-1.5 pr-3 text-slate-500">{d.track}</td>
                              <td className="py-1.5 pr-3 text-slate-700">{d.name}</td>
                              <td className="py-1.5 pr-3 text-slate-500">{d.staffId}</td>
                              <td className="py-1.5 pr-3">
                                <span className={d.neverSent ? 'text-red-600 font-medium' : 'text-amber-600 font-medium'}>
                                  {d.neverSent ? 'Never sent' : 'Reminder failed (originally sent OK)'}
                                </span>
                              </td>
                              <td className="py-1.5 text-slate-500">{d.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <button onClick={() => setShowReport((v) => !v)} className="w-full flex items-center justify-between text-left">
                <p className="text-sm font-semibold text-slate-800">Response Report — who&apos;s filled, who hasn&apos;t</p>
                {showReport ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {showReport && (
                <div className="mt-4 space-y-5">
                  {bulkResult && (
                    <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      {bulkResult.deleted !== undefined && <p className="text-emerald-700">Deleted {bulkResult.deleted}.</p>}
                      {bulkResult.sent !== undefined && <p className="text-emerald-700">Resent to {bulkResult.sent}.</p>}
                      {bulkResult.skipped && bulkResult.skipped.length > 0 && (
                        <p className="text-amber-700 mt-1">{bulkResult.skipped.length} failed/skipped — {bulkResult.skipped.slice(0, 5).map((s) => `${s.name} (${s.reason})`).join('; ')}{bulkResult.skipped.length > 5 ? '…' : ''}</p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <BreakdownTable title="Completion by Business Unit" rows={buBreakdown} />
                    <BreakdownTable title="Completion by Department" rows={deptBreakdown} />
                  </div>

                  {(detail.staffExclusions.length > 0 || detail.managerExclusions.length > 0) && (
                    <div className="border border-slate-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Excluded from this cycle — never launched, not counted toward completion</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {detail.staffExclusions.length > 0 && (
                          <div>
                            <p className="text-[11px] font-medium text-slate-500 mb-1">Track A ({detail.staffExclusions.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {detail.staffExclusions.map((e) => (
                                <span key={e.staffId} className="text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">{e.staffName || e.staffId}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {detail.managerExclusions.length > 0 && (
                          <div>
                            <p className="text-[11px] font-medium text-slate-500 mb-1">Track B ({detail.managerExclusions.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {detail.managerExclusions.map((e) => (
                                <span key={e.staffId} className="text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">{e.staffName || e.staffId}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="relative max-w-xs">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={reportQuery}
                        onChange={(e) => setReportQuery(e.target.value)}
                        placeholder="Search by name or Staff ID…"
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs"
                      />
                    </div>
                    <label className="text-[11px] text-slate-500">
                      Status
                      <select
                        value={reportStatusFilter}
                        onChange={(e) => setReportStatusFilter(e.target.value as FillStatusFilter)}
                        className="block border border-slate-300 rounded-md px-2 py-1.5 text-xs mt-0.5"
                      >
                        <option value="all">All</option>
                        <option value="filled">Filled</option>
                        <option value="sent-unfilled">Sent, not filled</option>
                        <option value="unsent">Not sent yet</option>
                      </select>
                    </label>
                    <label className="text-[11px] text-slate-500">
                      Filled from
                      <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)} className="block border border-slate-300 rounded-md px-2 py-1.5 text-xs mt-0.5" />
                    </label>
                    <label className="text-[11px] text-slate-500">
                      Filled to
                      <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)} className="block border border-slate-300 rounded-md px-2 py-1.5 text-xs mt-0.5" />
                    </label>
                    {(reportStatusFilter !== 'all' || reportDateFrom || reportDateTo || reportQuery) && (
                      <button
                        type="button"
                        onClick={() => { setReportQuery(''); setReportStatusFilter('all'); setReportDateFrom(''); setReportDateTo('') }}
                        className="text-[11px] font-medium text-slate-500 hover:text-red-600 underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <p className="text-xs font-semibold text-slate-600">Track A — Staff Self-Fill ({filteredStaffSurveys.length})</p>
                      <div className="flex items-center gap-2">
                        {canAdmin && selectedStaffSurveyIds.size > 0 && (
                          <>
                            <span className="text-[11px] text-slate-500">{selectedStaffSurveyIds.size} selected</span>
                            <button onClick={() => bulkStaffAction('resend')} disabled={bulkBusy} className="text-[11px] font-medium text-navy-700 hover:underline disabled:opacity-50">Resend</button>
                            <button onClick={() => bulkStaffAction('delete')} disabled={bulkBusy} className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50">Delete</button>
                            <button onClick={() => sendValidationEmails([...selectedStaffSurveyIds])} disabled={bulkBusy} className="text-[11px] font-medium text-navy-700 hover:underline disabled:opacity-50">Send Manager Validation Email</button>
                          </>
                        )}
                        {canAdmin && (
                          <button
                            onClick={() => sendValidationEmails(filteredStaffSurveys.filter((s) => s.respondedAt).map((s) => s.id))}
                            disabled={bulkBusy || filteredStaffSurveys.every((s) => !s.respondedAt)}
                            className="text-[11px] font-medium text-navy-700 hover:underline disabled:opacity-50"
                            title="Sends/resends the manager validation email for everyone here who has already submitted — safe to click any time, already-sent ones are skipped."
                          >
                            Send Validation Emails (All Submitted)
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-slate-100">
                            {canAdmin && (
                              <th className="py-1.5 pr-2 w-4">
                                <input
                                  type="checkbox"
                                  checked={filteredStaffSurveys.length > 0 && filteredStaffSurveys.every((s) => selectedStaffSurveyIds.has(s.id))}
                                  onChange={(e) => setSelectedStaffSurveyIds(e.target.checked ? new Set(filteredStaffSurveys.map((s) => s.id)) : new Set())}
                                />
                              </th>
                            )}
                            <th className="py-1.5 pr-3">Staff</th>
                            <th className="py-1.5 pr-3">BU</th>
                            <th className="py-1.5 pr-3 text-center">Sent / Filled</th>
                            <th className="py-1.5 pr-3">Line Manager(s)</th>
                            <th className="py-1.5 pr-3">Manager Validation(s)</th>
                            <th className="py-1.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedStaffSurveys.map((s) => {
                            const state = tickState(s.sentAt, s.respondedAt, detail.cycle.expiryDays)
                            return (
                            <tr key={s.id} className="border-b border-slate-50 last:border-0">
                              {canAdmin && (
                                <td className="py-1.5 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedStaffSurveyIds.has(s.id)}
                                    onChange={(e) => setSelectedStaffSurveyIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(s.id); else next.delete(s.id); return next })}
                                  />
                                </td>
                              )}
                              <td className="py-1.5 pr-3 text-slate-700">{s.staffName} <span className="text-slate-400">({s.staffId})</span></td>
                              <td className="py-1.5 pr-3 text-slate-500">{s.businessUnit}</td>
                              <td className="py-1.5 pr-3 text-center">
                                {canAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => sendOrResendStaffSurvey(s.id)}
                                    disabled={sendingId === s.id || state === 'filled'}
                                    title={`${state === 'unsent' ? 'Send' : state === 'filled' ? 'Already filled' : 'Resend'} to ${s.staffName} (${state}${state !== 'unsent' && state !== 'filled' ? ' — resending resets the expiry clock' : ''})`}
                                    className="hover:opacity-70 disabled:cursor-default"
                                  >
                                    {sendingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 mx-auto" /> : <span className={TICK_STYLE[state]}>{TICK_SYMBOL[state]}</span>}
                                  </button>
                                ) : (
                                  <span className={TICK_STYLE[state]}>{TICK_SYMBOL[state]}</span>
                                )}
                              </td>
                              <td className="py-1.5 pr-3 text-slate-500">
                                {s.lineManagerNames.length > 0 ? s.lineManagerNames.join(', ') : s.rosterStatus === 'not-in-roster' ? (
                                  <span className="text-red-600" title="This person's Staff ID doesn't match anyone in the current roster — likely a Staff ID formatting mismatch or they've been removed from the roster since this link was created.">Not in current roster</span>
                                ) : (
                                  <span className="text-amber-600" title="Found in the roster, but no Line Manager Staff ID is on file for them.">No manager on file</span>
                                )}
                              </td>
                              <td className="py-1.5 pr-3 text-slate-500">
                                {(() => {
                                  const oldFlow = s.validations.map((v) => ({ managerName: v.managerName || 'Manager', done: !!v.respondedAt }))
                                  const newFlow = (needsReviewEntriesByStaffId.get(s.staffId) ?? []).map((e) => ({ managerName: e.managerName, done: !!e.submittedAt }))
                                  // The same manager can appear in both flows (an old per-person validation
                                  // link plus the newer team-review entry) — show each manager once, done if either is.
                                  const byManager = new Map<string, { managerName: string; done: boolean }>()
                                  for (const r of [...oldFlow, ...newFlow]) {
                                    const key = r.managerName.trim().toLowerCase()
                                    const prev = byManager.get(key)
                                    byManager.set(key, { managerName: r.managerName, done: !!prev?.done || r.done })
                                  }
                                  const rows = [...byManager.values()]
                                  if (rows.length === 0) return '—'
                                  return rows.map((r, i) => (
                                    <span key={i}>
                                      {r.managerName}: <span className={r.done ? 'text-emerald-600 font-medium' : 'text-amber-600'}>{r.done ? '✓' : 'pending'}</span>
                                      {i < rows.length - 1 ? ', ' : ''}
                                    </span>
                                  ))
                                })()}
                              </td>
                              <td className="py-1.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {!s.respondedAt && s.sentAt && canAdmin && (
                                    <button onClick={() => stopReminders('staff-survey', s.id)} disabled={stoppingId === s.id} className="text-slate-400 hover:text-red-600" title="Stop reminders for this person">
                                      {stoppingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                  {canAdmin && (
                                    <button onClick={() => deleteStaffSurvey(s.id, s.staffName)} disabled={deletingId === s.id} className="text-slate-400 hover:text-red-600" title="Delete this Track A link">
                                      {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            )
                          })}
                          {filteredStaffSurveys.length === 0 && (
                            <tr><td colSpan={7} className="py-4 text-center text-slate-400">No one launched yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Pagination page={reportPage} totalItems={filteredStaffSurveys.length} pageSize={REPORT_PAGE_SIZE} onChange={setReportPage} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-600">Track B — Manager Team-Fill ({filteredManagerSurveys.length})</p>
                      {canAdmin && selectedManagerSurveyIds.size > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500">{selectedManagerSurveyIds.size} selected</span>
                          <button onClick={() => bulkManagerAction('resend')} disabled={bulkBusy} className="text-[11px] font-medium text-navy-700 hover:underline disabled:opacity-50">Resend</button>
                          <button onClick={() => bulkManagerAction('delete')} disabled={bulkBusy} className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50">Delete</button>
                        </div>
                      )}
                    </div>
                    {canAdmin && filteredManagerSurveys.length > 0 && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5">
                        <input
                          type="checkbox"
                          checked={filteredManagerSurveys.every((m) => selectedManagerSurveyIds.has(m.id))}
                          onChange={(e) => setSelectedManagerSurveyIds(e.target.checked ? new Set(filteredManagerSurveys.map((m) => m.id)) : new Set())}
                        />
                        Select all
                      </label>
                    )}
                    <div className="space-y-2">
                      {filteredManagerSurveys.map((m) => {
                        const active = m.teamMembers.filter((t) => t.status === 'accepted' || t.status === 'added')
                        const done = active.filter((t) => t.submittedAt).length
                        const state = tickState(m.sentAt, m.respondedAt, detail.cycle.expiryDays)
                        return (
                          <div key={m.id} className="border border-slate-100 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {canAdmin && (
                                  <input
                                    type="checkbox"
                                    checked={selectedManagerSurveyIds.has(m.id)}
                                    onChange={(e) => setSelectedManagerSurveyIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(m.id); else next.delete(m.id); return next })}
                                  />
                                )}
                                {canAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => sendOrResendManagerSurvey(m.id)}
                                    disabled={sendingId === m.id || state === 'filled'}
                                    title={`${state === 'unsent' ? 'Send' : state === 'filled' ? 'Already complete' : 'Resend'} to ${m.managerName} (${state}${state !== 'unsent' && state !== 'filled' ? ' — resending resets the expiry clock' : ''})`}
                                    className="hover:opacity-70 disabled:cursor-default"
                                  >
                                    {sendingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : <span className={TICK_STYLE[state]}>{TICK_SYMBOL[state]}</span>}
                                  </button>
                                ) : (
                                  <span className={TICK_STYLE[state]}>{TICK_SYMBOL[state]}</span>
                                )}
                                <p className="text-xs font-medium text-slate-700">{m.managerName} <span className="text-slate-400">({m.managerStaffId})</span></p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-500">
                                  {m.rosterConfirmedAt ? `${done}/${active.length} team members done` : 'Roster not yet confirmed'}
                                  {m.respondedAt && <span className="text-emerald-600 font-medium"> — complete</span>}
                                </span>
                                {!m.respondedAt && m.sentAt && canAdmin && (
                                  <button onClick={() => stopReminders('manager-survey', m.id)} disabled={stoppingId === m.id} className="text-slate-400 hover:text-red-600" title="Stop reminders for this manager">
                                    {stoppingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellOff className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                                {canAdmin && (
                                  <button onClick={() => deleteManagerSurvey(m.id, m.managerName)} disabled={deletingId === m.id} className="text-slate-400 hover:text-red-600" title="Delete this Track B link">
                                    {deletingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                            </div>
                            {active.length > 0 && (
                              <ul className="mt-1.5 text-[11px] text-slate-500 space-y-0.5">
                                {active.map((t) => (
                                  <li key={t.id}>{t.staffName} — {t.submittedAt ? <span className="text-emerald-600 font-medium">done</span> : <span className="text-amber-600">pending</span>}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                      {filteredManagerSurveys.length === 0 && <p className="text-xs text-slate-400">No managers launched yet.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {canExport && (
              <button onClick={downloadExcel} disabled={exporting} className="flex items-center gap-1.5 text-sm font-medium text-navy-700 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 disabled:opacity-50">
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Download Excel (by Business Unit)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
