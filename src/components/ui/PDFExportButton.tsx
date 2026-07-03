'use client'

import { useState } from 'react'
import { Printer } from 'lucide-react'
import { FontSizePicker, type FontSizeOption } from './FontSizePicker'

interface PDFExportButtonProps {
  reportTitle?: string
}

export function PDFExportButton({ reportTitle }: PDFExportButtonProps) {
  const [showPicker, setShowPicker] = useState(false)

  function printWithSize(size: FontSizeOption) {
    setShowPicker(false)

    if (size !== 'normal') {
      document.body.dataset.exportFontSize = size
    }

    const cleanup = () => {
      delete document.body.dataset.exportFontSize
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)

    if (reportTitle) {
      const prev = document.title
      document.title = reportTitle
      window.print()
      document.title = prev
    } else {
      window.print()
    }
  }

  return (
    <div className="relative no-print">
      <button
        onClick={() => setShowPicker(true)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
      >
        <Printer className="w-3.5 h-3.5" />
        Export PDF
      </button>

      {showPicker && (
        <FontSizePicker
          onSelect={printWithSize}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
