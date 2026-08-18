'use client'

import { useState, useMemo, createRef, useRef, useEffect } from 'react'
import { Download, Loader2, ChevronDown, Presentation, FileText, Image as ImageIcon } from 'lucide-react'
import { buildSlideNodes, SLIDE_TITLES, SLIDE_COUNT } from './index'
import { exportFullDeckPptx } from '@/lib/pptx-export'
import { exportSlidesAsPdf, exportSlidesAsJpgZip } from '@/lib/slide-export'
import type { GroupAnalytics } from '@/lib/analytics'

interface SlideDeckExportMenuProps {
  data: GroupAnalytics
  periodLabel: string
}

// Renders its own hidden, fixed-1280x720 copy of every slide purely for export capture — this is
// independent of whatever scale the on-screen SlideViewer is using at the current viewport width,
// so PDF/JPG exports always come out at the deck's native resolution and font sizes, never scaled down.
export function SlideDeckExportMenu({ data, periodLabel }: SlideDeckExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'pptx' | 'pdf' | 'jpg' | null>(null)
  // Offscreen slides (needed for PDF/JPG capture) are expensive to mount — each one carries its
  // own Plotly chart instances. Only build them once the user actually opens the export menu,
  // instead of on every page load, so pages that never touch export stay fast.
  const [everOpened, setEverOpened] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const slideRefs = useMemo(() => Array.from({ length: SLIDE_COUNT }, () => createRef<HTMLDivElement>()), [])
  const slides = everOpened ? buildSlideNodes(data, periodLabel) : []

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function run(kind: 'pptx' | 'pdf' | 'jpg') {
    setBusy(kind)
    setOpen(false)
    try {
      if (kind === 'pptx') {
        await exportFullDeckPptx(data, periodLabel)
      } else {
        const els = slideRefs.map((r) => r.current).filter((el): el is HTMLDivElement => !!el)
        if (kind === 'pdf') await exportSlidesAsPdf(els, `LD_Investment_Report_${periodLabel.replace(/[^\w]+/g, '_')}.pdf`)
        else await exportSlidesAsJpgZip(els, SLIDE_TITLES, `LD_Investment_Report_${periodLabel.replace(/[^\w]+/g, '_')}.zip`)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative no-print" ref={menuRef}>
      <button
        onClick={() => { setOpen((p) => !p); setEverOpened(true) }}
        disabled={busy !== null}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-slate-400" />}
        Export
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-50 p-1.5">
          <button onClick={() => run('pptx')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
            <Presentation className="w-4 h-4 text-navy-600" />
            <div className="text-left">
              <p className="font-medium">PowerPoint (.pptx)</p>
              <p className="text-[11px] text-slate-400">Editable — all 7 slides</p>
            </div>
          </button>
          <button onClick={() => run('pdf')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
            <FileText className="w-4 h-4 text-report-red" />
            <div className="text-left">
              <p className="font-medium">PDF</p>
              <p className="text-[11px] text-slate-400">All 7 slides, one file</p>
            </div>
          </button>
          <button onClick={() => run('jpg')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
            <ImageIcon className="w-4 h-4 text-gold-500" />
            <div className="text-left">
              <p className="font-medium">JPG images (.zip)</p>
              <p className="text-[11px] text-slate-400">One image per slide</p>
            </div>
          </button>
        </div>
      )}

      {/* Off-screen fixed-resolution render, source of truth for PDF/JPG capture */}
      <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }} aria-hidden>
        {slides.map((slide, i) => (
          <div key={i} ref={slideRefs[i]} style={{ width: 1280, height: 720 }}>
            {slide}
          </div>
        ))}
      </div>
    </div>
  )
}
