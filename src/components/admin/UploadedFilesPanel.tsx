'use client'

import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Search, Download, ChevronDown, ChevronUp } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

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
  const [query, setQuery] = useState('')
  const [collapsedBUs, setCollapsedBUs] = useState<Set<string>>(new Set())
  const [collapsedTrainings, setCollapsedTrainings] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/survey-files')
      .then((r) => r.json())
      .then((data) => setFiles(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((f) => {
      if (sourceFilter !== 'ALL' && f.source !== sourceFilter) return false
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
  }, [files, sourceFilter, query])

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
          <div className="flex flex-wrap items-center gap-2 mb-3">
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
