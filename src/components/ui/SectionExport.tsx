'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { exportCSV, exportExcel, type ExportSheet } from '@/lib/export'
import { ImageExport } from './ImageExport'

export interface SectionExportProps {
  /** Container ref for PNG capture — if omitted, image button is not shown */
  captureRef?: React.RefObject<HTMLElement | null>
  rows?: Record<string, unknown>[]
  sheets?: ExportSheet[]
  filename: string
  label?: string
  format?: 'csv' | 'xlsx'
}

export function SectionExport({
  captureRef,
  rows,
  sheets,
  filename,
  label,
  format = 'csv',
}: SectionExportProps) {
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setBusy(true)
    try {
      if (format === 'xlsx' && sheets) await exportExcel(sheets, filename)
      else if (rows) await exportCSV(rows, filename)
    } finally {
      setBusy(false)
    }
  }

  const hasData = (rows && rows.length > 0) || (sheets && sheets.some((s) => s.rows.length > 0))

  return (
    <div className="no-capture no-print flex items-center gap-1">
      {/* Data export (CSV / Excel) */}
      <button
        onClick={handleExport}
        disabled={!hasData || busy}
        title={`Export ${label ?? filename}`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {label ?? (format === 'xlsx' ? 'Excel' : 'CSV')}
      </button>

      {/* Image export */}
      {captureRef && (
        <ImageExport targetRef={captureRef} filename={filename} />
      )}
    </div>
  )
}
