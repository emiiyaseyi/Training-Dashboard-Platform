'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, ChevronUp, Trash2, Save, Loader2, X, Pencil, AlertTriangle, Plus, Calendar, Download, Upload, Users, RefreshCw } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import { NairaSign } from '@/components/ui/NairaSign'
import { FilterBar } from '@/components/ui/FilterBar'
import { MONTHS, filterToParams, filterLabel, type PeriodFilter } from '@/lib/filter-types'
import { exportExcel, exportPdfSections, buildBusinessUnitSections } from '@/lib/export'
import { sendStageInBatches } from '@/lib/survey-send-batches'
import { normalizeTrainingNameKey } from '@/lib/training-name'

// Sentinel resyncingBUKey/resyncBUResult use for the "all trainings at once" button, distinct from
// any real groupKey() value so the two loading/result states never collide.
const ALL_TRAININGS_KEY = '__all_trainings__'

// Records a Business Unit fix corrected in the database but couldn't find a matching row for in
// the Google Sheet (see pushTrainingRecordFieldsToSheet's notFoundRecords) — listed individually,
// not just as a count, so each one can actually be located and fixed by hand in the sheet.
function SheetNotFoundList({
  records,
  onFind,
}: {
  records?: { staffId: string; training: string; month: string }[]
  onFind: (training: string) => void
}) {
  if (!records || records.length === 0) return null
  return (
    <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <p className="font-medium text-amber-700 mb-1">
        {records.length} record{records.length === 1 ? '' : 's'} updated here, but couldn&apos;t be matched in the sheet (Staff ID + Training + Month didn&apos;t line up with any row there) — fix these manually in the sheet:
      </p>
      <ul className="space-y-0.5">
        {records.map((r, i) => (
          <li key={i} className="text-slate-600 flex items-center justify-between gap-2 flex-wrap">
            <span>{r.staffId} — {r.training} — {r.month}</span>
            <button onClick={() => onFind(r.training)} className="text-navy-600 hover:text-navy-800 font-medium whitespace-nowrap">
              Find this training ↓
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Every field the Training Report export can include — all ticked by default (see
// reportColumns), the admin unticks whichever they don't want in that download.
const REPORT_COLUMNS: { key: string; header: string }[] = [
  { key: 'serialNo', header: 'Serial No' },
  { key: 'staffName', header: 'Name' },
  { key: 'staffId', header: 'Staff ID' },
  { key: 'email', header: 'Email' },
  { key: 'businessUnit', header: 'Business Unit' },
  { key: 'training', header: 'Training' },
  { key: 'month', header: 'Month' },
  { key: 'year', header: 'Year' },
  { key: 'cost', header: 'Cost (₦)' },
  { key: 'hours', header: 'Hours' },
  { key: 'trainingType', header: 'Training Type' },
  { key: 'capability', header: 'Capability' },
  { key: 'vendor', header: 'Vendor' },
  { key: 'dateAdded', header: 'Date Added' },
]

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
  // Set when this record is the auto-linked mirror of a scheduled attendee — editing month/year
  // here also moves that schedule's real dates (see PUT .../training/[id]).
  scheduleId: string | null
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
  month: string; year: string
}

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

interface NamedOption { id: string; name: string }
interface VendorOption extends NamedOption { order: number }

export function TrainingRecordsTab({ initialEditRecordId, initialSearchQuery }: { initialEditRecordId?: string; initialSearchQuery?: string } = {}) {
  const [groups, setGroups] = useState<TrainingGroup[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Consumed once groups matching the deep-link search have loaded (see the effect below) —
  // cleared after use so a later manual search doesn't re-trigger auto-expand/edit. The parent
  // page resolves these props from the URL asynchronously (after its own mount effect), so this
  // can't just be the initial useState value — it needs its own effect reacting to the prop arriving.
  const [pendingEditRecordId, setPendingEditRecordId] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmingGroupKey, setConfirmingGroupKey] = useState<string | null>(null)
  const [alsoDeleteSchedule, setAlsoDeleteSchedule] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [applyingToSimilar, setApplyingToSimilar] = useState(false)
  const [resyncingBUKey, setResyncingBUKey] = useState<string | null>(null)
  const [resyncBUResult, setResyncBUResult] = useState<{
    key: string; message: string
    sheetNotFoundRecords?: { staffId: string; training: string; month: string }[]
  } | null>(null)

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
    trainingMode: 'physical' as 'physical' | 'virtual' | 'platform' | 'hybrid', location: '', meetingLink: '',
    preEnabled: true, post1Enabled: true, post2Enabled: true,
    additionalCc: '', additionalCcMode: 'all' as 'all' | 'individual',
  })
  const [surveyDaysAfter, setSurveyDaysAfter] = useState({ preDaysBefore: 7, post1DaysAfter: 1, post2DaysAfter: 30 })
  // Whether to include the platform-wide default Cc on a stage's first send, if creating this
  // schedule triggers an immediate send because a stage is already due (see createSchedule below).
  const [newTrainingIncludeDefaultCc, setNewTrainingIncludeDefaultCc] = useState(true)
  const [newTrainingIncludeLineManagerCc, setNewTrainingIncludeLineManagerCc] = useState(true)
  const [createSendProgress, setCreateSendProgress] = useState<string | null>(null)
  // Only used when additionalCcMode === 'individual' — who (beyond the automatic line-manager Cc
  // and the platform-wide default Cc) each specific attendee should also Cc, picked from the same
  // roster search as the attendee picker itself.
  const [pendingAttendeeCc, setPendingAttendeeCc] = useState<Record<string, RosterStaff[]>>({})
  const [ccSearchQuery, setCcSearchQuery] = useState<Record<string, string>>({})
  const [attendeeQuery, setAttendeeQuery] = useState('')
  const [pendingAttendees, setPendingAttendees] = useState<RosterStaff[]>([])
  const [creatingSchedule, setCreatingSchedule] = useState(false)
  const [createError, setCreateError] = useState('')

  // "Download Report" — a full, unpaginated period export (All Time / Year to Date / Full Year /
  // Month Range), independent of the on-screen search+pagination above. All columns ticked by
  // default; unticking one just leaves it out of the download, nothing server-side changes.
  const [showDownloadReport, setShowDownloadReport] = useState(false)
  const [reportFilter, setReportFilter] = useState<PeriodFilter>({ mode: 'all' })
  const [reportColumns, setReportColumns] = useState<Record<string, boolean>>(
    Object.fromEntries(REPORT_COLUMNS.map((c) => [c.key, true]))
  )
  const [downloadingReport, setDownloadingReport] = useState(false)

  const [fillingMissingFields, setFillingMissingFields] = useState(false)
  const [fillResult, setFillResult] = useState<{
    scanned: number; filled: number; unmatched: number
    unmatchedRecords: { id: string; staffId: string; staffName: string; training: string; missingFields: string[]; reason: string }[]
    noNewDataRecords: { id: string; staffId: string; staffName: string; training: string; missingFields: string[]; reason: string }[]
    missingVendorRecords: { id: string; staffId: string; staffName: string; training: string; missingFields: string[]; reason: string }[]
  } | null>(null)
  // Manual fix for a record Fill Missing Fields couldn't match by name on its own — search the
  // same roster directly and pick the right person.
  const [manualFixId, setManualFixId] = useState<string | null>(null)
  const [manualFixQuery, setManualFixQuery] = useState('')
  const [manualFixSavingId, setManualFixSavingId] = useState<string | null>(null)

  // "Trainings Missing Vendor" — every training cohort with no vendor on any attendee's record,
  // so it's fixable in bulk (one vendor for the whole cohort) or per-attendee, instead of hunting
  // for them one page of the main table at a time. Broadened beyond just Vendor — any of
  // Vendor/Hours/Type/Capability missing for a WHOLE cohort shows up here. Cost is deliberately
  // excluded (see the missing-vendor GET route) — 0 is ambiguous between "unset" and "genuinely
  // free", so checking it caused already-fixed trainings to keep reappearing here forever. Fix
  // Cost the normal way, via the row edit in the table below.
  const MISSING_DETAIL_FIELDS: { key: 'vendor' | 'hours' | 'trainingType' | 'capability'; label: string }[] = [
    { key: 'vendor', label: 'Vendor' },
    { key: 'hours', label: 'Hours' },
    { key: 'trainingType', label: 'Type' },
    { key: 'capability', label: 'Capability' },
  ]
  const [showMissingVendor, setShowMissingVendor] = useState(false)
  const [loadingMissingVendor, setLoadingMissingVendor] = useState(false)
  const [missingVendorGroups, setMissingVendorGroups] = useState<{
    training: string; month: string; year: number; businessUnits: string[]; attendeeCount: number
    missingFields: string[]
    records: { id: string; staffName: string; staffId: string; businessUnit: string }[]
  }[]>([])
  const [expandedMissingVendorKey, setExpandedMissingVendorKey] = useState<string | null>(null)
  const [missingVendorPickerKey, setMissingVendorPickerKey] = useState<string | null>(null)
  const [missingDetailsDraft, setMissingDetailsDraft] = useState<Record<string, string>>({})
  const [settingVendorKey, setSettingVendorKey] = useState<string | null>(null)
  const [sheetPushNote, setSheetPushNote] = useState<string | null>(null)

  // "Possible Duplicate Trainings" — same person, same training name, filed under more than one
  // Month/Year. Almost always the same real attendance recorded twice, not two genuine cohorts —
  // lets the admin pick which record to keep instead of the missing-details panel (or anything
  // else) silently treating them as separate trainings.
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [loadingDuplicates, setLoadingDuplicates] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<{
    staffName: string; staffId: string; training: string
    records: {
      id: string; businessUnit: string; month: string; year: number
      cost: number; hours: number | null; trainingType: string | null; capability: string | null; vendor: string | null
      createdAt: string
    }[]
  }[]>([])
  const [resolvingDuplicateKey, setResolvingDuplicateKey] = useState<string | null>(null)
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set())
  const [bulkDeletingDuplicates, setBulkDeletingDuplicates] = useState(false)

  // Per-schedule question exclusion — same feature/state shape as Survey Automation's own Add
  // Schedule form: untick a question (from the shared, global bank) to hide it from THIS
  // schedule's respondents only. Question lists load lazily, only once this form is actually
  // opened.
  type StageKey = 'pre' | 'post1' | 'post2'
  const [excludedQuestionIds, setExcludedQuestionIds] = useState<Partial<Record<StageKey, string[]>>>({})
  const [stageQuestions, setStageQuestions] = useState<Record<StageKey, { id: string; label: string; section: string | null }[]>>({
    pre: [], post1: [], post2: [],
  })
  const [stageQuestionsLoaded, setStageQuestionsLoaded] = useState(false)
  useEffect(() => {
    if (!addingNew || stageQuestionsLoaded) return
    setStageQuestionsLoaded(true)
    ;(async () => {
      const stages: StageKey[] = ['pre', 'post1', 'post2']
      const results = await Promise.all(stages.map((st) => fetch(`/api/admin/survey-questions?stage=${st}`).then((r) => r.json())))
      setStageQuestions({ pre: results[0], post1: results[1], post2: results[2] })
    })()
  }, [addingNew, stageQuestionsLoaded])

  const toggleExcludedQuestion = (stage: StageKey, questionId: string, exclude: boolean) => {
    setExcludedQuestionIds((prev) => {
      const current = new Set(prev[stage] ?? [])
      if (exclude) current.add(questionId)
      else current.delete(questionId)
      return { ...prev, [stage]: Array.from(current) }
    })
  }

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
    if (initialSearchQuery) setQuery(initialSearchQuery)
    if (initialEditRecordId) setPendingEditRecordId(initialEditRecordId)
  }, [initialSearchQuery, initialEditRecordId])

  // Once the deep-link search above has loaded matching groups, find the specific record, expand
  // its group, and open it for editing — same effect as clicking the row directly.
  useEffect(() => {
    if (!pendingEditRecordId || groups.length === 0) return
    for (const g of groups) {
      const record = g.records.find((r) => r.id === pendingEditRecordId)
      if (record) {
        setExpandedKey(groupKey(g))
        startEdit(record, g)
        setPendingEditRecordId(undefined)
        return
      }
    }
  }, [groups, pendingEditRecordId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setExcludedQuestionIds({})
    setNewTrainingIncludeDefaultCc(true)
    setNewTrainingIncludeLineManagerCc(true)
    setCreateSendProgress(null)
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
          // Persisted on the schedule, not just used for the immediate send below — see
          // skipLineManagerCc on TrainingSchedule for why that distinction matters.
          skipLineManagerCc: !newTrainingIncludeLineManagerCc,
          excludedQuestionIds,
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
      const { createdAttendees } = await attendeesRes.json().catch(() => ({ createdAttendees: [] as { id: string; staffId: string }[] }))

      // Individual mode: push each attendee's own picked Cc list now that we finally have their
      // real attendeeId (createdAttendees maps staffId -> id) — anyone with none stays blank,
      // which still gets the automatic line-manager Cc and platform-wide default Cc, just no
      // extra addresses of their own.
      if (newTraining.additionalCcMode === 'individual') {
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
      // ISN'T due yet is untouched here; the cron picks it up once it actually becomes due. Sent
      // in small batches (not one request for the whole list) so a large participant list shows
      // live progress instead of one long hang, and never risks the server's request timeout.
      const daysUntilStart = (new Date(newTraining.startDate).getTime() - Date.now()) / 86400000
      const daysSinceEnd = (Date.now() - new Date(newTraining.endDate).getTime()) / 86400000
      const sendOptions = { skipDefaultCc: !newTrainingIncludeDefaultCc, skipLineManagerCc: !newTrainingIncludeLineManagerCc }
      const attendeeIds: string[] = (createdAttendees || []).map((a: { id: string }) => a.id)
      const dueStages: ('pre' | 'post1' | 'post2')[] = []
      if (newTraining.preEnabled && daysUntilStart <= surveyDaysAfter.preDaysBefore && daysUntilStart >= -3) dueStages.push('pre')
      if (newTraining.post1Enabled && daysSinceEnd >= surveyDaysAfter.post1DaysAfter) dueStages.push('post1')
      if (newTraining.post2Enabled && daysSinceEnd >= surveyDaysAfter.post2DaysAfter) dueStages.push('post2')

      if (attendeeIds.length > 0 && dueStages.length > 0) {
        for (const stage of dueStages) {
          await sendStageInBatches(schedule.id, stage, attendeeIds, sendOptions, (sentSoFar, total) => {
            setCreateSendProgress(`Sending ${stage === 'pre' ? 'Pre-Training' : stage === 'post1' ? 'Post-Training' : 'Manager Post-Training Impact Review'}… ${sentSoFar}/${total}`)
          }).catch(() => {})
        }
        setCreateSendProgress(null)
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

  const downloadReport = async (format: 'xlsx' | 'pdf') => {
    setDownloadingReport(true)
    try {
      const params = new URLSearchParams(filterToParams(reportFilter))
      const rows: Record<string, unknown>[] = await fetch(`/api/admin/records/training/export?${params.toString()}`)
        .then((r) => r.json())
        .catch(() => [])
      const activeColumns = REPORT_COLUMNS.filter((c) => reportColumns[c.key])
      const mapRow = (r: Record<string, unknown>) => Object.fromEntries(activeColumns.map((c) => [c.header, r[c.key]]))
      const sections = buildBusinessUnitSections(Array.isArray(rows) ? rows : [], mapRow, 'All')
      const filename = `training_records_${filterLabel(reportFilter).replace(/\s+/g, '_')}`
      if (format === 'xlsx') {
        await exportExcel(sections, filename)
      } else {
        await exportPdfSections(
          activeColumns.map((c) => ({ header: c.header, key: c.header })),
          sections.map((s) => ({ title: `Training Records — ${s.name}`, rows: s.rows })),
          filename
        )
      }
    } finally {
      setDownloadingReport(false)
    }
  }

  const fillMissingFields = async () => {
    setFillingMissingFields(true)
    setFillResult(null)
    try {
      const res = await fetch('/api/admin/records/training/fill-missing-fields', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        setFillResult(data)
        await load()
      }
    } finally {
      setFillingMissingFields(false)
    }
  }

  const manualFixRecord = async (recordId: string, staff: RosterStaff) => {
    setManualFixSavingId(recordId)
    try {
      const res = await fetch(`/api/admin/records/training/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staff.staffId, businessUnit: staff.businessUnit, email: staff.email || undefined }),
      })
      if (res.ok) {
        setManualFixId(null)
        setManualFixQuery('')
        setFillResult((prev) => prev && {
          ...prev,
          filled: prev.filled + 1,
          unmatchedRecords: prev.unmatchedRecords.filter((r) => r.id !== recordId),
        })
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to save.')
      }
    } finally {
      setManualFixSavingId(null)
    }
  }

  const openMissingVendor = async () => {
    setShowMissingVendor(true)
    setLoadingMissingVendor(true)
    try {
      const data = await fetch('/api/admin/records/training/missing-vendor').then((r) => r.json()).catch(() => [])
      setMissingVendorGroups(Array.isArray(data) ? data : [])
    } finally {
      setLoadingMissingVendor(false)
    }
  }

  const openDuplicates = async () => {
    setShowDuplicates(true)
    setLoadingDuplicates(true)
    try {
      const data = await fetch('/api/admin/records/training/possible-duplicates').then((r) => r.json()).catch(() => [])
      setDuplicateGroups(Array.isArray(data) ? data : [])
    } finally {
      setLoadingDuplicates(false)
    }
  }

  const resolveDuplicate = async (groupKey: string, keepId: string, deleteIds: string[]) => {
    setResolvingDuplicateKey(groupKey)
    try {
      const res = await fetch('/api/admin/records/training/possible-duplicates/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepId, deleteIds }),
      })
      if (res.ok) {
        setDuplicateGroups((prev) => prev.filter((g) => `${g.staffId || g.staffName}|${g.training}` !== groupKey))
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to resolve this duplicate.')
      }
    } finally {
      setResolvingDuplicateKey(null)
    }
  }

  const toggleDuplicateSelection = (id: string) => {
    setSelectedDuplicateIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allDuplicateIds = () => duplicateGroups.flatMap((g) => g.records.map((r) => r.id))

  const selectAllDuplicates = () => setSelectedDuplicateIds(new Set(allDuplicateIds()))
  const deselectAllDuplicates = () => setSelectedDuplicateIds(new Set())

  const runBulkDuplicateDelete = async (ids: string[], confirmMessage: string) => {
    if (ids.length === 0) return
    if (!confirm(confirmMessage)) return
    setBulkDeletingDuplicates(true)
    try {
      const idSet = new Set(ids)
      const res = await fetch('/api/admin/records/training/possible-duplicates/bulk-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      if (res.ok) {
        setDuplicateGroups((prev) => prev
          .map((g) => ({ ...g, records: g.records.filter((r) => !idSet.has(r.id)) }))
          .filter((g) => g.records.length > 1))
        setSelectedDuplicateIds(new Set())
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to bulk delete the selected records.')
      }
    } finally {
      setBulkDeletingDuplicates(false)
    }
  }

  const bulkDeleteSelectedDuplicates = () =>
    runBulkDuplicateDelete(
      [...selectedDuplicateIds],
      `Delete ${selectedDuplicateIds.size} selected record(s)? This can't be undone from here (they're archived under Deleted Trainings).`
    )

  // Inverse of "Delete selected" — within every group that has at least one ticked row, deletes
  // every OTHER row in that group and leaves the ticked one(s) alone. Groups with nothing ticked
  // are left untouched entirely, so a mixed selection only resolves the groups the admin actually
  // made a choice on.
  const keepSelectedDuplicates = () => {
    const idsToDelete = duplicateGroups
      .filter((g) => g.records.some((r) => selectedDuplicateIds.has(r.id)))
      .flatMap((g) => g.records.filter((r) => !selectedDuplicateIds.has(r.id)).map((r) => r.id))
    runBulkDuplicateDelete(
      idsToDelete,
      `Keep the ${selectedDuplicateIds.size} selected record(s) and delete the other ${idsToDelete.length} in the same group(s)? This can't be undone from here (they're archived under Deleted Trainings).`
    )
  }

  // Shared by both the per-group bulk assign and a single attendee's individual override —
  // registers a brand-new vendor name into the shared Vendor list too (same upsert-by-name
  // convention as saveNewVendor above), so it shows up as a normal option everywhere else.
  // Sets whichever of Vendor/Hours/Type/Capability the admin actually filled in the draft form —
  // empty fields in the draft are simply left out of the request, so they stay untouched. (The
  // bulk-set API still accepts a cost field for the regular row-edit path; this panel just never
  // sends one, since Cost isn't offered here — see the missing-vendor GET route for why.)
  const setDetailsFor = async (groupKey: string, recordIds: string[], draft: Record<string, string>) => {
    const vendorName = draft.vendor?.trim()
    if (Object.values(draft).every((v) => !v?.trim())) return
    setSettingVendorKey(groupKey)
    try {
      if (vendorName && !vendors.some((v) => v.name.trim().toLowerCase() === vendorName.toLowerCase())) {
        const nextOrder = vendors.length > 0 ? Math.max(...vendors.map((v) => v.order)) + 1 : 0
        await fetch('/api/vendors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: vendorName, order: nextOrder }),
        }).catch(() => {})
        const fresh = await fetch('/api/vendors').then((r) => r.json()).catch(() => [])
        if (Array.isArray(fresh)) setVendors(fresh)
      }
      const body: Record<string, string | number> = {}
      if (vendorName) body.vendor = vendorName
      if (draft.cost?.trim()) body.cost = parseFloat(draft.cost)
      if (draft.hours?.trim()) body.hours = parseFloat(draft.hours)
      if (draft.trainingType?.trim()) body.trainingType = draft.trainingType.trim()
      if (draft.capability?.trim()) body.capability = draft.capability.trim()

      const res = await fetch('/api/admin/records/training/missing-vendor/bulk-set', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recordIds, ...body }),
      })
      const resData = await res.json().catch(() => null)
      if (res.ok) {
        setMissingVendorPickerKey(null)
        setMissingDetailsDraft({})
        setSheetPushNote((() => {
          const push = resData?.sheetPush
          if (!push) return null
          if (!push.success) return `Saved here, but the Excel sheet wasn't updated: ${push.error || 'unknown reason'}.`
          const parts = [`Also updated ${push.updated} row${push.updated === 1 ? '' : 's'} in the Excel sheet.`]
          if (push.notFound > 0) {
            parts.push(`${push.notFound} record${push.notFound === 1 ? '' : 's'} couldn't be matched to a row there (Staff ID + Training + Month didn't line up with anything in the sheet) — check those manually.`)
          }
          return parts.join(' ')
        })())
        // Updates local state directly from what was just submitted, instead of refetching the
        // whole list from the server — one less round trip, and avoids ever depending on a
        // server-side re-check to confirm what the admin just did (the exact pattern that caused
        // the old Cost-ambiguity loop this panel used to have).
        const setFieldKeys = Object.keys(body)
        const isIndividual = groupKey.includes('::')
        setMissingVendorGroups((prev) => prev
          .map((g) => {
            const gKey = `${g.training}|${g.month}|${g.year}`
            if (isIndividual) {
              if (!groupKey.startsWith(`${gKey}::`)) return g
              const recordId = groupKey.slice(gKey.length + 2)
              const records = g.records.filter((r) => r.id !== recordId)
              return { ...g, records, attendeeCount: records.length }
            }
            if (gKey !== groupKey) return g
            return { ...g, missingFields: g.missingFields.filter((f) => !setFieldKeys.includes(f)) }
          })
          .filter((g) => g.records.length > 0 && g.missingFields.length > 0)
        )
        await load()
      }
    } finally {
      setSettingVendorKey(null)
    }
  }

  // addingVendorForId doubles as which target gets the new vendor once saved: a real row id for
  // the inline row-edit picker, or this sentinel for the New Training Schedule form's own picker.
  const NEW_SCHEDULE_VENDOR_ID = '__new_schedule__'

  const saveNewVendor = async (rowId: string) => {
    const name = newVendorInput.trim()
    if (!name) return
    // A row id that isn't the current in-progress edit means this is the Fill Missing Fields
    // list's own quick-fill picker, not the row-edit form — save straight to the database instead
    // of into `draft` (which wouldn't even be showing for this record).
    const applyVendor = (vendorName: string) => {
      if (rowId === NEW_SCHEDULE_VENDOR_ID) setNewTraining((prev) => ({ ...prev, vendor: vendorName }))
      else if (editingId === rowId) setDraft((d) => (d ? { ...d, vendor: vendorName } : d))
      else quickSetVendor(rowId, vendorName)
    }
    // Same name, different case/spacing — just select the existing one instead of creating a duplicate.
    const existing = vendors.find((v) => v.name.trim().toLowerCase() === name.toLowerCase())
    if (existing) {
      applyVendor(existing.name)
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
        applyVendor(name)
      }
    } finally {
      setSavingNewVendor(false)
      setAddingVendorForId(null)
      setNewVendorInput('')
    }
  }

  // One-click Training Provider fill straight from the Fill Missing Fields list — no need to find
  // and expand the record's own group first. Saves directly via the same PUT the row-edit form
  // uses (so the sheet push, schedule-date sync, etc. all still happen), then removes the record
  // from the list locally rather than re-running the whole scan again.
  const [savingVendorFillId, setSavingVendorFillId] = useState<string | null>(null)
  const quickSetVendor = async (recordId: string, vendorName: string, trainingName?: string) => {
    setSavingVendorFillId(recordId)
    try {
      const res = await fetch(`/api/admin/records/training/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor: vendorName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to save Training Provider.')
        return
      }

      // Same "apply this to every other record still filed under the same training name" offer
      // the row-edit form gives — a Training Provider correction almost always applies to the
      // whole programme, not just the one attendee who happened to be fixed first.
      let appliedToTrainingName: string | null = null
      if (trainingName && confirm(`Apply this Training Provider to every other record with the training name "${trainingName}" too (any month/year)?`)) {
        const applyRes = await fetch('/api/admin/records/training/apply-to-similar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalTrainingName: trainingName, excludeId: recordId, changes: { vendor: vendorName } }),
        })
        const applyData = await applyRes.json().catch(() => ({}))
        if (applyRes.ok) {
          appliedToTrainingName = trainingName
          alert(`Applied to ${applyData.updated} other record${applyData.updated === 1 ? '' : 's'}.`)
        }
      }

      const appliedKey = appliedToTrainingName ? normalizeTrainingNameKey(appliedToTrainingName) : null
      setFillResult((prev) => prev && {
        ...prev,
        missingVendorRecords: prev.missingVendorRecords.filter((r) =>
          r.id !== recordId && (!appliedKey || normalizeTrainingNameKey(r.training) !== appliedKey)
        ),
      })
      await load()
    } finally {
      setSavingVendorFillId(null)
    }
  }

  const startEdit = (r: TrainingRecordRow, g: TrainingGroup) => {
    setEditingId(r.id)
    setDraft({
      staffName: r.staffName, staffId: r.staffId, businessUnit: r.businessUnit,
      cost: String(r.cost), hours: r.hours != null ? String(r.hours) : '',
      trainingType: r.trainingType || '', capability: r.capability || '', vendor: r.vendor || '',
      training: g.training, month: g.month, year: String(g.year),
    })
  }

  const saveEdit = async (r: TrainingRecordRow, g: TrainingGroup) => {
    if (!draft) return

    const monthOrYearChanged = draft.month !== g.month || draft.year !== String(g.year)
    if (monthOrYearChanged && r.scheduleId) {
      const ok = confirm(
        `This record is linked to a scheduled training — changing the month/year here also moves that schedule's dates ` +
        `(everyone on it, and Pre/Post survey timing). Continue?`
      )
      if (!ok) return
    }

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
          training: draft.training, month: draft.month, year: parseInt(draft.year) || g.year,
          cost: newCost, hours: draft.hours ? parseFloat(draft.hours) : null,
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

  const sheetPushSuffix = (sheetPush: { success: boolean; updated: number; notFound: number; error?: string } | null): string => {
    if (!sheetPush) return ''
    if (!sheetPush.success) return ` Sheet not updated: ${sheetPush.error || 'unknown reason'}.`
    if (sheetPush.notFound > 0) return ` Sheet: ${sheetPush.updated} row(s) updated, ${sheetPush.notFound} couldn't be matched there.`
    return ` Sheet: ${sheetPush.updated} row(s) updated too.`
  }

  const resyncBusinessUnit = async (g: TrainingGroup) => {
    const key = groupKey(g)
    if (!confirm(`Reset Business Unit for every attendee of "${g.training}" (${g.month} ${g.year}) to their CURRENT one on the Staff Roster? This overwrites whatever is stored now, even if it isn't blank.`)) return
    setResyncingBUKey(key)
    setResyncBUResult(null)
    try {
      const res = await fetch('/api/admin/records/training/resync-business-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingName: g.training }),
      })
      const data = await res.json()
      if (res.ok) {
        setResyncBUResult({
          key,
          message: `${data.updated} of ${data.totalChecked} corrected${data.unresolved > 0 ? `, ${data.unresolved} skipped (Staff ID not found on the roster)` : ''}.${sheetPushSuffix(data.sheetPush)}`,
          sheetNotFoundRecords: data.sheetPush?.notFoundRecords,
        })
        await load()
      } else {
        alert(data.error || 'Failed to resync Business Unit.')
      }
    } finally {
      setResyncingBUKey(null)
    }
  }

  const resyncAllBusinessUnits = async () => {
    if (!confirm('Reset Business Unit for EVERY training record, across every training, to each attendee\'s CURRENT one on the Staff Roster? This overwrites whatever is stored now, even where it isn\'t blank. Records whose Staff ID doesn\'t resolve on the roster are left untouched and reported.')) return
    setResyncingBUKey(ALL_TRAININGS_KEY)
    setResyncBUResult(null)
    try {
      const res = await fetch('/api/admin/records/training/resync-business-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        setResyncBUResult({
          key: ALL_TRAININGS_KEY,
          message: `${data.updated} of ${data.totalChecked} corrected across all trainings${data.unresolved > 0 ? `, ${data.unresolved} skipped (Staff ID not found on the roster)` : ''}.${sheetPushSuffix(data.sheetPush)}`,
          sheetNotFoundRecords: data.sheetPush?.notFoundRecords,
        })
        await load()
      } else {
        alert(data.error || 'Failed to resync Business Unit.')
      }
    } finally {
      setResyncingBUKey(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          placeholder="Search training, name, Staff ID, or Business Unit…"
          className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!showDownloadReport && (
          <button onClick={() => setShowDownloadReport(true)} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50">
            <Download className="w-4 h-4" /> Download Report
          </button>
        )}
        {!showMissingVendor && (
          <button onClick={openMissingVendor} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 border border-amber-300 rounded-lg px-3 py-2 hover:bg-amber-50">
            <AlertTriangle className="w-4 h-4" /> Trainings Missing Details
          </button>
        )}
        {!showDuplicates && (
          <button onClick={openDuplicates} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 border border-amber-300 rounded-lg px-3 py-2 hover:bg-amber-50">
            <AlertTriangle className="w-4 h-4" /> Possible Duplicate Trainings
          </button>
        )}
        <button
          onClick={fillMissingFields}
          disabled={fillingMissingFields}
          title="Fills blank Staff ID, Business Unit, or Email on any training record from the matching Employee record — never overwrites a value that's already there."
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
        >
          {fillingMissingFields ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
          Fill Missing Fields
        </button>
        <button
          onClick={() => resyncAllBusinessUnits()}
          disabled={resyncingBUKey === ALL_TRAININGS_KEY}
          title="Overwrites Business Unit on EVERY training record with each attendee's CURRENT one from the Staff Roster, even where it isn't blank — for cleaning up more than one training at once, not just an obviously-missing value."
          className="flex items-center gap-1.5 text-sm font-medium text-navy-600 border border-navy-300 rounded-lg px-3 py-2 hover:bg-navy-50 disabled:opacity-50"
        >
          {resyncingBUKey === ALL_TRAININGS_KEY ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Fix Business Unit from Roster (All Trainings)
        </button>
        {!addingNew && (
          <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg px-3 py-2 hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add Training Schedule
          </button>
        )}
      </div>

      {resyncBUResult?.key === ALL_TRAININGS_KEY && (
        <div className="-mt-2">
          <p className="text-xs text-slate-500">{resyncBUResult.message}</p>
          <SheetNotFoundList records={resyncBUResult.sheetNotFoundRecords} onFind={(training) => { setQuery(training); setExpandedKey(null) }} />
        </div>
      )}

      {fillResult && (
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
          <p className="text-xs text-slate-600">
            Scanned {fillResult.scanned} record{fillResult.scanned === 1 ? '' : 's'} with a blank field — filled {fillResult.filled}.
          </p>
          {fillResult.unmatchedRecords.length > 0 && (
            <div className="text-xs">
              <p className="font-medium text-red-700 mb-1">Couldn&apos;t match {fillResult.unmatchedRecords.length} to anyone in the roster:</p>
              <ul className="space-y-1.5">
                {fillResult.unmatchedRecords.map((r) => {
                  const picking = manualFixId === r.id
                  const q = manualFixQuery.trim().toLowerCase()
                  const results = picking && q
                    ? directory.filter((s) => s.name.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q)).slice(0, 6)
                    : []
                  return (
                    <li key={r.id} className="text-slate-600">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span>
                          <span className="font-medium text-slate-700">{r.staffName}</span> ({r.staffId || '—'}) — {r.training} — missing {r.missingFields.join(', ')}
                        </span>
                        {!picking && (
                          <button onClick={() => { setManualFixId(r.id); setManualFixQuery('') }} className="text-navy-600 hover:text-navy-800 font-medium whitespace-nowrap">
                            Fix manually
                          </button>
                        )}
                      </div>
                      <p className="text-slate-400">{r.reason}</p>
                      {picking && (
                        <div className="relative mt-1 max-w-xs">
                          <input
                            autoFocus
                            value={manualFixQuery}
                            onChange={(e) => setManualFixQuery(e.target.value)}
                            placeholder="Search the roster by name or Staff ID…"
                            className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs"
                          />
                          {results.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                              {results.map((s) => (
                                <button
                                  key={s.staffId}
                                  onClick={() => manualFixRecord(r.id, s)}
                                  disabled={manualFixSavingId === r.id}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 flex items-center justify-between gap-2 disabled:opacity-50"
                                >
                                  <span className="text-slate-700">{s.name}</span>
                                  <span className="text-slate-400">{s.staffId} · {s.businessUnit}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <button onClick={() => { setManualFixId(null); setManualFixQuery('') }} className="text-slate-400 hover:text-slate-600 text-[11px] mt-1">
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {fillResult.noNewDataRecords.length > 0 && (
            <div className="text-xs">
              <p className="font-medium text-amber-700 mb-1">Matched, but nothing to fill for {fillResult.noNewDataRecords.length} — their Employee record is missing the same field:</p>
              <ul className="space-y-1">
                {fillResult.noNewDataRecords.map((r) => (
                  <li key={r.id} className="text-slate-600 flex items-center justify-between gap-2 flex-wrap">
                    <span>
                      <span className="font-medium text-slate-700">{r.staffName}</span> ({r.staffId || '—'}) — {r.training} — missing {r.missingFields.join(', ')}
                    </span>
                    <a
                      href={`/admin/employees?search=${encodeURIComponent(r.staffName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-navy-600 hover:text-navy-800 font-medium whitespace-nowrap"
                    >
                      Fix in Employees →
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fillResult.missingVendorRecords.length > 0 && (
            <div className="text-xs">
              <p className="font-medium text-amber-700 mb-1">
                No Training Provider on file for {fillResult.missingVendorRecords.length} record{fillResult.missingVendorRecords.length === 1 ? '' : 's'} — this can&apos;t be auto-filled from anywhere, fill it in manually:
              </p>
              <ul className="space-y-1">
                {fillResult.missingVendorRecords.map((r) => (
                  <li key={r.id} className="text-slate-600 flex items-center justify-between gap-2 flex-wrap bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <span>
                      <span className="font-medium text-slate-700">{r.staffName}</span> ({r.staffId || '—'}) — {r.training}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {savingVendorFillId === r.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-navy-600" />
                      ) : addingVendorForId === r.id ? (
                        <>
                          <input
                            autoFocus
                            value={newVendorInput}
                            onChange={(e) => setNewVendorInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveNewVendor(r.id) }}
                            placeholder="New vendor name"
                            className="w-32 border border-slate-200 rounded px-1.5 py-1"
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
                        </>
                      ) : (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value === '__add_new__') { setNewVendorInput(''); setAddingVendorForId(r.id); return }
                            if (e.target.value) quickSetVendor(r.id, e.target.value, r.training)
                          }}
                          className="border border-slate-200 rounded px-1.5 py-1"
                        >
                          <option value="" disabled>Set Training Provider…</option>
                          {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                          <option value="__add_new__">+ Add new vendor…</option>
                        </select>
                      )}
                      <button
                        onClick={() => { setQuery(r.training); setExpandedKey(null) }}
                        className="text-navy-600 hover:text-navy-800 font-medium whitespace-nowrap"
                        title="Find this training in the list instead"
                      >
                        Find ↓
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showDownloadReport && (
        <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Download className="w-4 h-4 text-slate-400" /> Download Training Report
            </div>
            <button onClick={() => setShowDownloadReport(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">Period</p>
            <FilterBar
              availableYears={[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2, new Date().getFullYear() - 3]}
              value={reportFilter}
              onChange={setReportFilter}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-slate-600">Columns to include</p>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => setReportColumns(Object.fromEntries(REPORT_COLUMNS.map((c) => [c.key, true])))}
                  className="text-navy-600 hover:text-navy-800 font-medium"
                >
                  Select All
                </button>
                <span className="text-slate-300">·</span>
                <button
                  onClick={() => setReportColumns(Object.fromEntries(REPORT_COLUMNS.map((c) => [c.key, false])))}
                  className="text-navy-600 hover:text-navy-800 font-medium"
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-1.5 bg-white border border-slate-200 rounded-lg p-3">
              {REPORT_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!reportColumns[c.key]}
                    onChange={(e) => setReportColumns({ ...reportColumns, [c.key]: e.target.checked })}
                  />
                  {c.header}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadReport('xlsx')}
              disabled={downloadingReport || Object.values(reportColumns).every((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
            >
              {downloadingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download Excel
            </button>
            <button
              onClick={() => downloadReport('pdf')}
              disabled={downloadingReport || Object.values(reportColumns).every((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
            >
              {downloadingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download PDF
            </button>
          </div>
        </div>
      )}

      {showMissingVendor && (
        <div className="border border-amber-200 rounded-lg p-4 space-y-3 bg-amber-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Trainings Missing Details
            </div>
            <button onClick={() => setShowMissingVendor(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Only flags a field when NOT A SINGLE attendee in that training has it — a stray record missing just one field
            while the rest of its cohort is filled in won&apos;t show up here; edit that one directly in the table below instead.
          </p>
          {sheetPushNote && <p className="text-[11px] text-navy-700 bg-navy-50 border border-navy-100 rounded px-2 py-1">{sheetPushNote}</p>}

          {loadingMissingVendor ? (
            <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
          ) : missingVendorGroups.length === 0 ? (
            <p className="text-xs text-slate-400">Every training has Vendor, Hours, Type, and Capability on file. Nothing to fix.</p>
          ) : (
            <div className="space-y-2">
              {missingVendorGroups.map((g) => {
                const key = `${g.training}|${g.month}|${g.year}`
                const expanded = expandedMissingVendorKey === key
                const picking = missingVendorPickerKey === key
                const recordIds = g.records.map((r) => r.id)
                const fieldsForGroup = MISSING_DETAIL_FIELDS.filter((f) => g.missingFields.includes(f.key))
                return (
                  <div key={key} className="bg-white border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button onClick={() => setExpandedMissingVendorKey(expanded ? null : key)} className="flex-1 text-left min-w-[12rem]">
                        <p className="text-sm font-medium text-slate-800">{g.training}</p>
                        <p className="text-xs text-slate-500">
                          {g.month} {g.year} · {g.businessUnits.join(', ')} · {g.attendeeCount} attendee{g.attendeeCount === 1 ? '' : 's'}
                        </p>
                        <p className="text-[11px] text-amber-700 mt-0.5">Missing: {fieldsForGroup.map((f) => f.label).join(', ')}</p>
                      </button>
                      {picking ? (
                        <div className="flex items-end gap-1.5 flex-wrap">
                          {fieldsForGroup.map((f) => (
                            <div key={f.key} className="flex flex-col">
                              <label className="text-[10px] text-slate-400">{f.label}</label>
                              {f.key === 'trainingType' ? (
                                <select
                                  value={missingDetailsDraft[f.key] || ''}
                                  onChange={(e) => setMissingDetailsDraft({ ...missingDetailsDraft, [f.key]: e.target.value })}
                                  className="w-28 border border-slate-300 rounded-md px-2 py-1 text-xs"
                                >
                                  <option value="">—</option>
                                  {trainingTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                                </select>
                              ) : f.key === 'capability' ? (
                                <select
                                  value={missingDetailsDraft[f.key] || ''}
                                  onChange={(e) => setMissingDetailsDraft({ ...missingDetailsDraft, [f.key]: e.target.value })}
                                  className="w-28 border border-slate-300 rounded-md px-2 py-1 text-xs"
                                >
                                  <option value="">—</option>
                                  {capabilities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                              ) : f.key === 'vendor' ? (
                                <>
                                  <input
                                    value={missingDetailsDraft[f.key] || ''}
                                    onChange={(e) => setMissingDetailsDraft({ ...missingDetailsDraft, [f.key]: e.target.value })}
                                    placeholder="Vendor name"
                                    list={`vendor-options-${key}`}
                                    className="w-32 border border-slate-300 rounded-md px-2 py-1 text-xs"
                                  />
                                  <datalist id={`vendor-options-${key}`}>
                                    {vendors.map((v) => <option key={v.id} value={v.name} />)}
                                  </datalist>
                                </>
                              ) : (
                                <input
                                  type="number"
                                  value={missingDetailsDraft[f.key] || ''}
                                  onChange={(e) => setMissingDetailsDraft({ ...missingDetailsDraft, [f.key]: e.target.value })}
                                  className="w-20 border border-slate-300 rounded-md px-2 py-1 text-xs"
                                />
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => setDetailsFor(key, recordIds, missingDetailsDraft)}
                            disabled={settingVendorKey === key}
                            className="p-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {settingVendorKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => { setMissingVendorPickerKey(null); setMissingDetailsDraft({}) }} className="p-1.5 rounded border border-slate-300 text-slate-500 hover:bg-slate-50">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setMissingVendorPickerKey(key); setMissingDetailsDraft({}) }}
                          className="text-xs font-medium text-white bg-amber-600 rounded-lg px-3 py-1.5 hover:bg-amber-700 whitespace-nowrap"
                        >
                          Set for All
                        </button>
                      )}
                    </div>

                    {expanded && (
                      <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                        {g.records.map((r) => {
                          const individualKey = `${key}::${r.id}`
                          const individualPicking = missingVendorPickerKey === individualKey
                          return (
                            <div key={r.id} className="flex items-center justify-between text-xs text-slate-600 flex-wrap gap-1">
                              <span>{r.staffName} <span className="text-slate-400">({r.staffId}) · {r.businessUnit}</span></span>
                              {individualPicking ? (
                                <div className="flex items-end gap-1.5 flex-wrap">
                                  {fieldsForGroup.map((f) => (
                                    <div key={f.key} className="flex flex-col">
                                      <label className="text-[10px] text-slate-400">{f.label}</label>
                                      {f.key === 'trainingType' ? (
                                        <select
                                          value={missingDetailsDraft[f.key] || ''}
                                          onChange={(e) => setMissingDetailsDraft({ ...missingDetailsDraft, [f.key]: e.target.value })}
                                          className="w-24 border border-slate-300 rounded-md px-2 py-1 text-xs"
                                        >
                                          <option value="">—</option>
                                          {trainingTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                                        </select>
                                      ) : f.key === 'capability' ? (
                                        <select
                                          value={missingDetailsDraft[f.key] || ''}
                                          onChange={(e) => setMissingDetailsDraft({ ...missingDetailsDraft, [f.key]: e.target.value })}
                                          className="w-24 border border-slate-300 rounded-md px-2 py-1 text-xs"
                                        >
                                          <option value="">—</option>
                                          {capabilities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                      ) : f.key === 'vendor' ? (
                                        <input
                                          value={missingDetailsDraft[f.key] || ''}
                                          onChange={(e) => setMissingDetailsDraft({ ...missingDetailsDraft, [f.key]: e.target.value })}
                                          placeholder="Vendor name"
                                          list={`vendor-options-${key}`}
                                          className="w-28 border border-slate-300 rounded-md px-2 py-1 text-xs"
                                        />
                                      ) : (
                                        <input
                                          type="number"
                                          value={missingDetailsDraft[f.key] || ''}
                                          onChange={(e) => setMissingDetailsDraft({ ...missingDetailsDraft, [f.key]: e.target.value })}
                                          className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs"
                                        />
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => setDetailsFor(individualKey, [r.id], missingDetailsDraft)}
                                    disabled={settingVendorKey === individualKey}
                                    className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    <Save className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setMissingVendorPickerKey(individualKey); setMissingDetailsDraft({}) }}
                                  className="text-navy-600 hover:text-navy-800 font-medium"
                                >
                                  Set individually
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showDuplicates && (
        <div className="border border-amber-200 rounded-lg p-4 space-y-3 bg-amber-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Possible Duplicate Trainings
            </div>
            <button onClick={() => setShowDuplicates(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Same person (by Staff ID, or by first + last name when there&apos;s no Staff ID — a missing/extra middle name doesn&apos;t
            stop a match), same training name — whether or not the records share a Month/Year. Pick which record to keep; the
            other(s) are deleted (any linked schedule keeps pointing to the one you keep). Or tick checkboxes across any
            group(s) and either delete just those, or keep just those and delete the rest of their group.
          </p>

          {duplicateGroups.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={selectAllDuplicates} className="text-xs font-medium text-navy-600 hover:text-navy-800">
                  Select all
                </button>
                <button onClick={deselectAllDuplicates} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                  Deselect all
                </button>
              </div>
              {selectedDuplicateIds.size > 0 && (
                <span className="text-xs font-medium text-amber-800">{selectedDuplicateIds.size} selected</span>
              )}
            </div>
          )}

          {selectedDuplicateIds.size > 0 && (
            <div className="flex items-center justify-end gap-2 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2">
              <button
                onClick={keepSelectedDuplicates}
                disabled={bulkDeletingDuplicates}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
              >
                {bulkDeletingDuplicates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Keep selected, delete the rest
              </button>
              <button
                onClick={bulkDeleteSelectedDuplicates}
                disabled={bulkDeletingDuplicates}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-600 rounded-lg px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeletingDuplicates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Delete selected
              </button>
            </div>
          )}

          {loadingDuplicates ? (
            <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
          ) : duplicateGroups.length === 0 ? (
            <p className="text-xs text-slate-400">No same-person, same-training duplicates found.</p>
          ) : (
            <div className="space-y-2">
              {duplicateGroups.map((g) => {
                const groupKey = `${g.staffId || g.staffName}|${g.training}`
                const resolving = resolvingDuplicateKey === groupKey
                return (
                  <div key={groupKey} className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-slate-800">{g.staffName} <span className="text-slate-400 font-normal">({g.staffId})</span> — {g.training}</p>
                    <div className="overflow-x-auto mt-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-100">
                            <th className="py-1 pr-2"></th>
                            <th className="text-left font-medium py-1 pr-3">Month/Year</th>
                            <th className="text-left font-medium py-1 pr-3">Business Unit</th>
                            <th className="text-right font-medium py-1 pr-3">Cost</th>
                            <th className="text-right font-medium py-1 pr-3">Hours</th>
                            <th className="text-left font-medium py-1 pr-3">Type</th>
                            <th className="text-left font-medium py-1 pr-3">Capability</th>
                            <th className="text-left font-medium py-1 pr-3">Vendor</th>
                            <th className="py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.records.map((r) => (
                            <tr key={r.id} className="border-b border-slate-50 last:border-0">
                              <td className="py-1.5 pr-2">
                                <input
                                  type="checkbox"
                                  checked={selectedDuplicateIds.has(r.id)}
                                  onChange={() => toggleDuplicateSelection(r.id)}
                                  className="w-3.5 h-3.5"
                                />
                              </td>
                              <td className="py-1.5 pr-3 text-slate-600 whitespace-nowrap">{r.month} {r.year}</td>
                              <td className="py-1.5 pr-3 text-slate-600">{r.businessUnit}</td>
                              <td className="py-1.5 pr-3 text-slate-600 text-right">{r.cost ? `₦${r.cost.toLocaleString()}` : '—'}</td>
                              <td className="py-1.5 pr-3 text-slate-600 text-right">{r.hours ?? '—'}</td>
                              <td className="py-1.5 pr-3 text-slate-600">{r.trainingType || '—'}</td>
                              <td className="py-1.5 pr-3 text-slate-600">{r.capability || '—'}</td>
                              <td className="py-1.5 pr-3 text-slate-600">{r.vendor || '—'}</td>
                              <td className="py-1.5 text-center">
                                <button
                                  onClick={() => resolveDuplicate(groupKey, r.id, g.records.filter((other) => other.id !== r.id).map((other) => other.id))}
                                  disabled={resolving}
                                  className="text-xs font-medium text-white bg-amber-600 rounded-lg px-2.5 py-1 hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                                >
                                  {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Keep this one'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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
              {addingVendorForId === NEW_SCHEDULE_VENDOR_ID ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    autoFocus
                    value={newVendorInput}
                    onChange={(e) => setNewVendorInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveNewVendor(NEW_SCHEDULE_VENDOR_ID) }}
                    placeholder="New vendor name"
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => saveNewVendor(NEW_SCHEDULE_VENDOR_ID)}
                    disabled={savingNewVendor || !newVendorInput.trim()}
                    className="p-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {savingNewVendor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => { setAddingVendorForId(null); setNewVendorInput('') }} className="p-1.5 rounded border border-slate-300 text-slate-500 hover:bg-slate-50">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <select
                  value={newTraining.vendor}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') { setNewVendorInput(''); setAddingVendorForId(NEW_SCHEDULE_VENDOR_ID); return }
                    setNewTraining({ ...newTraining, vendor: e.target.value })
                  }}
                  className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mt-1"
                >
                  <option value="">Select…</option>
                  {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                  <option value="__add_new__">+ Add new vendor…</option>
                </select>
              )}
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
                ['hybrid', 'Hybrid'],
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
            {(newTraining.trainingMode === 'physical' || newTraining.trainingMode === 'hybrid') && (
              <input
                value={newTraining.location}
                onChange={(e) => setNewTraining({ ...newTraining, location: e.target.value })}
                placeholder="Venue address"
                className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm mb-2"
              />
            )}
            {newTraining.trainingMode !== 'physical' && (
              <input
                value={newTraining.meetingLink}
                onChange={(e) => setNewTraining({ ...newTraining, meetingLink: e.target.value })}
                placeholder={newTraining.trainingMode === 'virtual' ? 'Meeting link (Zoom, Teams, etc.)' : newTraining.trainingMode === 'hybrid' ? 'Meeting link for remote attendees' : 'Learning platform link'}
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
            <p className="text-xs font-medium text-slate-600 mb-1.5">Survey Questions</p>
            <p className="text-[11px] text-slate-400 mb-2">
              Untick a question to hide it from this schedule&apos;s respondents only — the question stays in the shared bank for every
              other schedule. Everything&apos;s ticked (shown) by default.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                ['pre', 'Pre-Training', newTraining.preEnabled] as const,
                ['post1', 'Post-1', newTraining.post1Enabled] as const,
                ['post2', 'Post-2', newTraining.post2Enabled] as const,
              ] as const)
                .filter(([, , enabled]) => enabled)
                .map(([stage, label]) => (
                  <div key={stage} className="border border-slate-200 rounded-lg p-2.5 max-h-52 overflow-y-auto">
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">{label}</p>
                    {!stageQuestionsLoaded ? (
                      <p className="text-[11px] text-slate-400">Loading…</p>
                    ) : stageQuestions[stage].length === 0 ? (
                      <p className="text-[11px] text-slate-400">No questions configured for this stage.</p>
                    ) : (
                      <div className="space-y-1">
                        {stageQuestions[stage].map((q) => {
                          const isExcluded = (excludedQuestionIds[stage] ?? []).includes(q.id)
                          return (
                            <label key={q.id} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={!isExcluded}
                                onChange={(e) => toggleExcludedQuestion(stage, q.id, !e.target.checked)}
                              />
                              <span>{q.section ? <span className="text-slate-400">{q.section}: </span> : null}{q.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
            </div>
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

          <div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={newTrainingIncludeDefaultCc}
                onChange={(e) => setNewTrainingIncludeDefaultCc(e.target.checked)}
              />
              Include Default Cc on the first send
            </label>
            <p className="text-[11px] text-slate-400 mt-1">
              If a survey stage is already due and sends immediately on creation, untick this to skip the platform-wide
              default Cc for that first send — useful for a large participant list so it doesn&apos;t clog the default Cc inbox.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={newTrainingIncludeLineManagerCc}
                onChange={(e) => setNewTrainingIncludeLineManagerCc(e.target.checked)}
              />
              Cc line managers on the first send
            </label>
            <p className="text-[11px] text-slate-400 mt-1">
              Untick to leave line managers off the Pre/Post-1 Cc for that first send (Post-2 already goes straight to the manager, so this has no effect there).
            </p>
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
          {createSendProgress && (
            <p className="flex items-center gap-1.5 text-xs text-navy-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {createSendProgress}
            </p>
          )}
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
                            <th className="px-2.5 py-2">Month/Year</th>
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
                                    <td className="px-2.5 py-1.5">
                                      <input
                                        value={draft.staffId}
                                        onChange={(e) => {
                                          const staffId = e.target.value
                                          // Typing a Staff ID that resolves on the roster fills Business
                                          // Unit from that person's CURRENT one too — still overridable via
                                          // the dropdown right after, same as picking an attendee does on
                                          // the New Training Schedule form.
                                          const match = directory.find((d) => d.staffId.toUpperCase() === staffId.trim().toUpperCase())
                                          setDraft((prev) => prev && { ...prev, staffId, businessUnit: match ? match.businessUnit : prev.businessUnit })
                                        }}
                                        className="w-24 border border-slate-200 rounded px-1.5 py-1"
                                      />
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      <select value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} className="w-32 border border-slate-200 rounded px-1.5 py-1">
                                        {!businessUnits.some((bu) => bu.name === draft.businessUnit) && draft.businessUnit && (
                                          <option value={draft.businessUnit}>{draft.businessUnit} (not recognized)</option>
                                        )}
                                        {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-2.5 py-1.5"><input value={draft.training} onChange={(e) => setDraft({ ...draft, training: e.target.value })} className="w-36 border border-slate-200 rounded px-1.5 py-1" /></td>
                                    <td className="px-2.5 py-1.5">
                                      <div className="flex items-center gap-1">
                                        <select value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} className="w-24 border border-slate-200 rounded px-1.5 py-1">
                                          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                        <input type="number" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} className="w-16 border border-slate-200 rounded px-1.5 py-1" />
                                      </div>
                                      {r.scheduleId && (
                                        <p className="text-[10px] text-amber-600 mt-1 max-w-[9rem]">Linked to a schedule — this moves its dates too.</p>
                                      )}
                                    </td>
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
                                    <td className="px-2.5 py-2 text-slate-600">{g.month} {g.year}</td>
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
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => resyncBusinessUnit(g)}
                            disabled={resyncingBUKey === key}
                            title="Overwrites every attendee's Business Unit here with their CURRENT one from the Staff Roster, even if it isn't blank — use when a training was recorded under the wrong Business Unit for everyone."
                            className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 disabled:opacity-50"
                          >
                            {resyncingBUKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Fix Business Unit from Roster
                          </button>
                          {resyncBUResult?.key === key && <p className="text-xs text-slate-500">{resyncBUResult.message}</p>}
                          <button
                            onClick={() => setConfirmingGroupKey(key)}
                            className="flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 ml-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete This Training
                          </button>
                        </div>
                        {resyncBUResult?.key === key && (
                          <SheetNotFoundList records={resyncBUResult.sheetNotFoundRecords} onFind={(training) => { setQuery(training); setExpandedKey(null) }} />
                        )}
                      </div>
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
