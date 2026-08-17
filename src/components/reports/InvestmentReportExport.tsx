'use client'

import { useState, useCallback, useMemo, createRef, useRef } from 'react'
import { FileDown, Image as ImageIcon, Loader2, Presentation } from 'lucide-react'
import { FilterBar } from '@/components/ui/FilterBar'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { buildSlideNodes, SLIDE_TITLES } from '@/components/slides'
import { exportFullDeckPptx, exportSingleSlidePptx } from '@/lib/pptx-export'
import { captureSlidePng, downloadSlidePng, bundleZip } from '@/lib/slide-export'
import type { GroupAnalytics } from '@/lib/analytics'
import { type PeriodFilter, filterToQuery, filterLabel } from '@/lib/filter-types'

type SlideFormat = 'pptx' | 'png'

export function InvestmentReportExport() {
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })
  const [data, setData] = useState<GroupAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formats, setFormats] = useState<SlideFormat[]>(Array(7).fill('pptx'))
  const [exportingAll, setExportingAll] = useState(false)
  const [exportingSlide, setExportingSlide] = useState<number | null>(null)

  const slideRefs = useMemo(() => Array.from({ length: 7 }, () => createRef<HTMLDivElement>()), [])
  const loadedOnce = useRef(false)

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/analytics/group${filterToQuery(f)}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json)
      setAvailableYears(json.availableYears ?? [])
      loadedOnce.current = true
    } catch {
      setError('Could not load report data for this period.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleFilter = (f: PeriodFilter) => { setFilter(f); load(f) }

  const periodLabel = filterLabel(filter)
  const slides = data ? buildSlideNodes(data, periodLabel) : []

  const setFormat = (i: number, fmt: SlideFormat) => {
    setFormats((prev) => { const next = [...prev]; next[i] = fmt; return next })
  }

  const exportSlide = async (i: number) => {
    if (!data) return
    setExportingSlide(i)
    try {
      if (formats[i] === 'pptx') {
        await exportSingleSlidePptx(data, periodLabel, i + 1, `LD_Report_${SLIDE_TITLES[i].replace(/[^\w]+/g, '_')}`)
      } else {
        const el = slideRefs[i].current
        if (el) await downloadSlidePng(el, `LD_Report_Slide${i + 1}_${SLIDE_TITLES[i].replace(/[^\w]+/g, '_')}.png`)
      }
    } finally {
      setExportingSlide(null)
    }
  }

  const exportFullDeck = async () => {
    if (!data) return
    setExportingAll(true)
    try {
      const allPptx = formats.every((f) => f === 'pptx')
      if (allPptx) {
        await exportFullDeckPptx(data, periodLabel)
        return
      }
      // Mixed formats — bundle everything into one zip
      const files: { name: string; blob: Blob }[] = []
      for (let i = 0; i < 7; i++) {
        const title = SLIDE_TITLES[i].replace(/[^\w]+/g, '_')
        if (formats[i] === 'png') {
          const el = slideRefs[i].current
          if (el) files.push({ name: `Slide${i + 1}_${title}.png`, blob: await captureSlidePng(el) })
        }
      }
      // pptx slides that are part of the mixed export get bundled as one combined pptx if contiguous,
      // otherwise export the full deck pptx alongside — simplest correct approach: always include the
      // full pptx deck plus the requested PNGs, so nothing requested is missing.
      const mod = await import('@/lib/pptx-export')
      const pptx = await mod.buildReportPptx(data, periodLabel)
      const pptxArrayBuffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer
      files.push({ name: 'LD_Investment_Report.pptx', blob: new Blob([pptxArrayBuffer]) })
      await bundleZip(files, 'LD_Investment_Report.zip')
    } finally {
      setExportingAll(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-navy-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-navy-600">Generate Investment Report</p>
          <p className="text-xs text-report-gray mt-0.5">
            Select a date range, then export the 7-slide report deck as editable PowerPoint or as images — per slide or as a full deck.
          </p>
        </div>
        <FilterBar availableYears={availableYears} value={filter} onChange={handleFilter} />
      </div>

      {error && <AlertBadge variant="error" message={error} />}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading report data…
        </div>
      )}

      {!loading && data && (
        <>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
            {SLIDE_TITLES.map((title, i) => (
              <div key={title} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-navy-400 tabular-nums w-5 shrink-0">{i + 1}</span>
                  <span className="text-sm text-slate-700 truncate">{title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={formats[i]}
                    onChange={(e) => setFormat(i, e.target.value as SlideFormat)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pptx">PPTX (editable)</option>
                    <option value="png">PNG (image)</option>
                  </select>
                  <button
                    onClick={() => exportSlide(i)}
                    disabled={exportingSlide === i}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    {exportingSlide === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : formats[i] === 'pptx' ? <Presentation className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    Export
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end">
            <button
              onClick={exportFullDeck}
              disabled={exportingAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-600 text-white text-sm font-semibold hover:bg-navy-500 disabled:opacity-50 transition-colors"
            >
              {exportingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Export Full Deck
            </button>
          </div>

          {/* Off-screen render of all 7 slides at fixed 1280x720px — source for PNG capture and
              kept in sync with the on-screen slide components (buildSlideNodes is shared). */}
          <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }} aria-hidden>
            {slides.map((slide, i) => (
              <div key={i} ref={slideRefs[i]} style={{ width: 1280, height: 720 }}>
                {slide}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
