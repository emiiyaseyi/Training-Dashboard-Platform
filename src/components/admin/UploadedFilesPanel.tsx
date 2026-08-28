'use client'

import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Search, Download } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { DataTable } from '@/components/ui/DataTable'

interface UploadedFileRow {
  id: string
  source: 'survey' | 'custom-survey'
  surveyName: string
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Lists every file uploaded through a "file"-type survey question (training or custom survey),
// stored directly in the DB — see UploadedFile in schema.prisma — rather than Google Drive, which
// a bare service account can't reliably write into outside a Shared Drive. Each row is downloaded
// straight from GET /api/admin/survey-files/[id] (session-gated, same as this list).
export function UploadedFilesPanel() {
  const [files, setFiles] = useState<UploadedFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [query, setQuery] = useState('')

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
          f.surveyName.toLowerCase().includes(q)
        )
      ) return false
      return true
    })
  }, [files, sourceFilter, query])

  return (
    <SectionCard
      icon={FolderOpen}
      title="Uploaded Files"
      description="Documents attendees have uploaded through a survey's file question (e.g. certifications) — download any of them below."
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
                placeholder="Search by file, uploader, or survey…"
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs w-64"
              />
            </div>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
              <option value="ALL">Training + Custom Surveys</option>
              <option value="survey">Training Surveys only</option>
              <option value="custom-survey">Custom Surveys only</option>
            </select>
          </div>
          <DataTable
            columns={[
              { key: 'createdAt', header: 'Uploaded', sortable: true, render: (r) => new Date(r.createdAt as string).toLocaleString() },
              {
                key: 'uploaderName', header: 'Uploaded By', sortable: true,
                render: (r) => (
                  <span>
                    {(r.uploaderName as string) || 'Unknown'}
                    {r.uploaderStaffId ? <span className="text-slate-400"> ({r.uploaderStaffId as string})</span> : null}
                  </span>
                ),
              },
              {
                key: 'surveyName', header: 'Survey', sortable: true,
                render: (r) => (
                  <span>
                    {r.surveyName as string}
                    {r.stage ? <span className="text-slate-400"> · {STAGE_LABELS[r.stage as string] || (r.stage as string)}</span> : <span className="text-slate-400"> · Custom</span>}
                  </span>
                ),
              },
              { key: 'questionLabel', header: 'Question', sortable: true },
              { key: 'fileName', header: 'File', sortable: true },
              { key: 'fileSize', header: 'Size', align: 'right', sortable: true, render: (r) => formatSize(r.fileSize as number) },
              {
                key: 'id', header: '', align: 'center',
                render: (r) => (
                  <a
                    href={`/api/admin/survey-files/${r.id as string}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:text-navy-800"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                ),
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
            emptyMessage="No files have been uploaded through a survey yet."
          />
        </>
      )}
    </SectionCard>
  )
}
