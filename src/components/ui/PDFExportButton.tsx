'use client'

import { Printer } from 'lucide-react'

interface PDFExportButtonProps {
  reportTitle?: string
}

export function PDFExportButton({ reportTitle }: PDFExportButtonProps) {
  const handlePrint = () => {
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
    <button
      onClick={handlePrint}
      className="no-print flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
    >
      <Printer className="w-3.5 h-3.5" />
      Export PDF
    </button>
  )
}
