'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SlideViewerProps {
  slides: React.ReactNode[]
  slideRefs: React.RefObject<HTMLDivElement | null>[]
  index: number
  onIndexChange: (i: number) => void
}

// Design resolution matches the source deck's actual PowerPoint slide size exactly
// (13.333in x 7.5in at 96dpi = 1280x720px), so on-screen, PNG capture, and PPTX export
// all share identical proportions and font sizes — no separate "export size" to drift out of sync.
const CANVAS_W = 1280
const CANVAS_H = 720

// True slide-deck viewer: one 16:9 slide visible at a time, Prev/Next + dots + arrow keys.
// Every slide renders at a fixed 1280x720 real-pixel canvas, scaled to fit the available width
// via CSS transform — this avoids the overflow/overlap bugs that come from cascading percentage
// heights through flexbox + CSS grid. All slides stay mounted (off-screen ones at opacity-0) so
// each slide's ref keeps a real layout box at all times, which the export engine relies on.
export function SlideViewer({ slides, slideRefs, index, onIndexChange }: SlideViewerProps) {
  const total = slides.length
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    function measure() {
      if (!wrapperRef.current) return
      const availableW = wrapperRef.current.clientWidth
      setScale(Math.min(1, availableW / CANVAS_W))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [])

  const goPrev = useCallback(() => onIndexChange(Math.max(0, index - 1)), [index, onIndexChange])
  const goNext = useCallback(() => onIndexChange(Math.min(total - 1, index + 1)), [index, total, onIndexChange])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  return (
    <div className="flex flex-col items-center gap-4 px-6 pt-6 pb-4">
      <div ref={wrapperRef} className="w-full max-w-6xl">
        <div
          className="relative shadow-lg rounded-xl overflow-hidden border border-navy-100 bg-white mx-auto"
          style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              ref={slideRefs[i]}
              className="absolute top-0 left-0 origin-top-left"
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                transform: `scale(${scale})`,
                opacity: i === index ? 1 : 0,
                pointerEvents: i === index ? 'auto' : 'none',
                zIndex: i === index ? 1 : 0,
              }}
              aria-hidden={i !== index}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={goPrev} disabled={index === 0} className="p-2 rounded-full border border-navy-200 disabled:opacity-30 hover:bg-navy-50 transition-colors">
          <ChevronLeft className="w-4 h-4 text-navy-600" />
        </button>
        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-navy-600' : 'bg-navy-200 hover:bg-navy-300'}`}
            />
          ))}
        </div>
        <button onClick={goNext} disabled={index === total - 1} className="p-2 rounded-full border border-navy-200 disabled:opacity-30 hover:bg-navy-50 transition-colors">
          <ChevronRight className="w-4 h-4 text-navy-600" />
        </button>
        <span className="text-xs text-report-gray ml-2 tabular-nums">{index + 1} / {total}</span>
      </div>
    </div>
  )
}
