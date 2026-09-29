'use client'

import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Search, Download, ChevronDown, ChevronUp, Loader2, Package, PenLine } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { bundleZip } from '@/lib/slide-export'

interface UploadedFileRow {
  id: string
  source: 'survey' | 'custom-survey'
  surveyName: string
  businessUnit: string | null
  stage: string | null
  questionLabel: string
  fileName: string
  mimeType: string
  fileSize: number
  uploaderStaffId: string | null
  uploaderName: string | null
  createdAt: string
}

const STAGE_LABELS: Record<string, string> = { pre: 'Pre-Training', post1: 'Post-1', post2: 'Post-2' }
const UNASSIGNED_BU = 'Custom Surveys / No Business Unit'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Keeps every file's own name inside the zip, but disambiguates exact duplicates (the same
// filename uploaded by different people for the same question — common, since attendees often
// download the same template/certificate and re-upload it unchanged) by appending a counter.
function uniqueZipPath(path: string, used: Map<string, number>): string {
  const count = used.get(path) || 0
  used.set(path, count + 1)
  if (count === 0) return path
  const dot = path.lastIndexOf('.')
  return dot === -1 ? `${path} (${count})` : `${path.slice(0, dot)} (${count})${path.slice(dot)}`
}

// Lists every file uploaded through a "file"-type survey question (training or custom survey),
// stored directly in the DB — see UploadedFile in schema.prisma — rather than Google Drive, which
// a bare service account can't reliably write into outside a Shared Drive. Each row is downloaded
// straight from GET /api/admin/survey-files/[id] (session-gated, same as this list).
//
// Grouped Business Unit -> Training, matching how an admin actually goes looking for these (e.g.
// "certifications for the AML training in Wealth Management") rather than a flat list they'd have
// to search/sort through. Custom survey files have no reliable single Business Unit (audience can
// be "all"), so they land under one shared bucket instead of being scattered/mislabeled.
export function UploadedFilesPanel() {
  const [files, setFiles] = useState<UploadedFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [trainingFilter, setTrainingFilter] = useState('ALL')
  const [questionFilter, setQuestionFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [collapsedBUs, setCollapsedBUs] = useState<Set<string>>(new Set())
  const [collapsedTrainings, setCollapsedTrainings] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<{ renamed: number; total: number } | null>(null)

  useEffect(() => {
    fetch('/api/admin/survey-files')
      .then((r) => r.json())
      .then((data) => {
        const rows: UploadedFileRow[] = Array.isArray(data) ? data : []
        setFiles(rows)
        setSelectedIds(new Set(rows.map((f) => f.id))) // all ticked by default
      })
      .finally(() => setLoading(false))
  }, [])

  const trainingOptions = useMemo(
    () => [...new Set(files.map((f) => f.surveyName))].sort((a, b) => a.localeCompare(b)),
    [files]
  )
  const questionOptions = useMemo(
    () => [...new Set(files.map((f) => f.questionLabel))].sort((a, b) => a.localeCompare(b)),
    [files]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((f) => {
      if (sourceFilter !== 'ALL' && f.source !== sourceFilter) return false
      if (trainingFilter !== 'ALL' && f.surveyName !== trainingFilter) return false
      if (questionFilter !== 'ALL' && f.questionLabel !== questionFilter) return false
      if (
        q &&
        !(
          f.fileName.toLowerCase().includes(q) ||
          (f.uploaderName || '').toLowerCase().includes(q) ||
          (f.uploaderStaffId || '').toLowerCase().includes(q) ||
          f.surveyName.toLowerCase().includes(q) ||
          (f.businessUnit || '').toLowerCase().includes(q)
        )
      ) return false
      return true
    })
  }, [files, sourceFilter, trainingFilter, questionFilter, query])

  // Business Unit -> Training name -> files, each level sorted for a stable, predictable order
  // (most files first, so the busiest group surfaces at the top of a long list).
  const grouped = useMemo(() => {
    const byBU = new Map<string, Map<string, UploadedFileRow[]>>()
    for (const f of filtered) {
      const bu = f.businessUnit || UNASSIGNED_BU
      if (!byBU.has(bu)) byBU.set(bu, new Map())
      const byTraining = byBU.get(bu)!
      if (!byTraining.has(f.surveyName)) byTraining.set(f.surveyName, [])
      byTraining.get(f.surveyName)!.push(f)
    }
    return [...byBU.entries()]
      .map(([bu, byTraining]) => ({
        bu,
        total: [...byTraining.values()].reduce((sum, list) => sum + list.length, 0),
        trainings: [...byTraining.entries()]
          .map(([training, list]) => ({ training, files: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }))
          .sort((a, b) => b.files.length - a.files.length),
      }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  const toggleBU = (bu: string) => {
    setCollapsedBUs((prev) => {
      const next = new Set(prev)
      if (next.has(bu)) next.delete(bu)
      else next.add(bu)
      return next
    })
  }
  const toggleTraining = (key: string) => {
    setCollapsedTrainings((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // Select All / Deselect All act on whatever the current filters show, not the whole list — so
  // narrowing down to one training/question type and hitting "Select All" only grabs those.
  const selectAllVisible = () => setSelectedIds((prev) => new Set([...prev, ...filtered.map((f) => f.id)]))
  const deselectAllVisible = () => {
    const visible = new Set(filtered.map((f) => f.id))
    setSelectedIds((prev) => new Set([...prev].filter((id) => !visible.has(id))))
  }

  const selectedVisible = filtered.filter((f) => selectedIds.has(f.id))

  const downloadSelected = async () => {
    if (selectedVisible.length === 0) return
    setZipping({ done: 0, total: selectedVisible.length })
    try {
      const used = new Map<string, number>()
      const zipEntries: { name: string; blob: Blob }[] = []
      for (const f of selectedVisible) {
        const blob = await fetch(`/api/admin/survey-files/${f.id}`).then((r) => r.blob())
        const path = uniqueZipPath(`${f.businessUnit || UNASSIGNED_BU}/${f.surveyName}/${f.questionLabel}/${f.fileName}`, used)
        zipEntries.push({ name: path, blob })
        setZipping((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
      }
      await bundleZip(zipEntries, `uploaded-files-${new Date().toISOString().slice(0, 10)}.zip`)
    } finally {
      setZipping(null)
    }
  }

  const renameExisting = async () => {
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const res = await fetch('/api/admin/survey-files/backfill-names', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        setBackfillResult({ renamed: data.renamed, total: data.total })
        const fresh = await fetch('/api/admin/survey-files').then((r) => r.json()).catch(() => [])
        if (Array.isArray(fresh)) setFiles(fresh)
      }
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <SectionCard
      icon={FolderOpen}
      title="Uploaded Files"
      description="Documents attendees have uploaded through a survey's file question (e.g. certifications), grouped by Business Unit and Training — download any of them below."
    >
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by file, uploader, training, or Business Unit…"
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs w-72"
              />
            </div>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
              <option value="ALL">Training + Custom Surveys</option>
              <option value="survey">Training Surveys only</option>
              <option value="custom-survey">Custom Surveys only</option>
            </select>
            <select value={trainingFilter} onChange={(e) => setTrainingFilter(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs max-w-[16rem]">
              <option value="ALL">All Trainings</option>
              {trainingOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={questionFilter} onChange={(e) => setQuestionFilter(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs max-w-[14rem]">
              <option value="ALL">All Question Types</option>
              {questionOptions.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button onClick={selectAllVisible} className="text-xs font-medium text-navy-600 hover:text-navy-800">Select All</button>
            <span className="text-slate-300">·</span>
            <button onClick={deselectAllVisible} className="text-xs font-medium text-navy-600 hover:text-navy-800">Deselect All</button>
            <span className="text-xs text-slate-400">({selectedVisible.length} of {filtered.length} selected)</span>
            <button
              onClick={downloadSelected}
              disabled={selectedVisible.length === 0 || !!zipping}
              className="ml-auto flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {zipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
              {zipping ? `Zipping… ${zipping.done}/${zipping.total}` : `Download Selected (${selectedVisible.length})`}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              onClick={renameExisting}
              disabled={backfilling}
              title="Renames every file uploaded before file names included the staff name, training name, and training date — safe to run more than once, already-renamed files are skipped."
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
              {backfilling ? 'Renaming…' : 'Rename Existing Files to New Format'}
            </button>
            {backfillResult && (
              <span className="text-xs text-slate-500">
                Renamed {backfillResult.renamed} of {backfillResult.total} file{backfillResult.total === 1 ? '' : 's'}
                {backfillResult.renamed < backfillResult.total ? ' (the rest already matched or had no uploader on file).' : '.'}
              </span>
            )}
          </div>

          {grouped.length === 0 ? (
            <p className="text-xs text-slate-400">No files have been uploaded through a survey yet.</p>
          ) : (
            <div className="space-y-3">
              {grouped.map(({ bu, total, trainings }) => {
                const buCollapsed = collapsedBUs.has(bu)
                return (
                  <div key={bu} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleBU(bu)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-left"
                    >
                      <span className="text-sm font-semibold text-slate-800">{bu}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-500">
                        {total} file{total === 1 ? '' : 's'}
                        {buCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                    {!buCollapsed && (
                      <div className="divide-y divide-slate-100">
                        {trainings.map(({ training, files: trainingFiles }) => {
                          const key = `${bu}::${training}`
                          const trainingCollapsed = collapsedTrainings.has(key)
                          return (
                            <div key={key}>
                              <button
                                onClick={() => toggleTraining(key)}
                                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-slate-50 text-left"
                              >
                                <span className="text-xs font-medium text-slate-700">{training}</span>
                                <span className="flex items-center gap-2 text-[11px] text-slate-400">
                                  {trainingFiles.length} file{trainingFiles.length === 1 ? '' : 's'}
                                  {trainingCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                                </span>
                              </button>
                              {!trainingCollapsed && (
                                <div className="overflow-x-auto px-4 pb-2">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-slate-400 border-b border-slate-100">
                                        <th className="py-1 pr-2"></th>
                                        <th className="text-left font-medium py-1 pr-3">Uploaded</th>
                                        <th className="text-left font-medium py-1 pr-3">Uploaded By</th>
                                        <th className="text-left font-medium py-1 pr-3">Stage</th>
                                        <th className="text-left font-medium py-1 pr-3">Question</th>
                                        <th className="text-left font-medium py-1 pr-3">File</th>
                                        <th className="text-right font-medium py-1 pr-3">Size</th>
                                        <th className="py-1"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {trainingFiles.map((f) => (
                                        <tr key={f.id} className="border-b border-slate-50 last:border-0">
                                          <td className="py-1.5 pr-2">
                                            <input
                                              type="checkbox"
                                              checked={selectedIds.has(f.id)}
                                              onChange={() => toggleSelected(f.id)}
                                            />
                                          </td>
                                          <td className="py-1.5 pr-3 text-slate-600 whitespace-nowrap">{new Date(f.createdAt).toLocaleString()}</td>
                                          <td className="py-1.5 pr-3 text-slate-600">
                                            {f.uploaderName || 'Unknown'}
                                            {f.uploaderStaffId ? <span className="text-slate-400"> ({f.uploaderStaffId})</span> : null}
                                          </td>
                                          <td className="py-1.5 pr-3 text-slate-600">{f.stage ? (STAGE_LABELS[f.stage] || f.stage) : 'Custom'}</td>
                                          <td className="py-1.5 pr-3 text-slate-600">{f.questionLabel}</td>
                                          <td className="py-1.5 pr-3 text-slate-600">{f.fileName}</td>
                                          <td className="py-1.5 pr-3 text-slate-600 text-right whitespace-nowrap">{formatSize(f.fileSize)}</td>
                                          <td className="py-1.5 text-center">
                                            <a
                                              href={`/api/admin/survey-files/${f.id}`}
                                              className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800"
                                            >
                                              <Download className="w-3.5 h-3.5" /> Download
                                            </a>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
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
        </>
      )}
    </SectionCard>
  )
}
