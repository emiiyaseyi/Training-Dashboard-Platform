'use client'

import { useState, type RefObject } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { FontSizePicker, type FontSizeOption } from './FontSizePicker'

const FONT_SCALE: Record<FontSizeOption, number> = { small: 0.82, normal: 1, large: 1.28 }

interface ImageExportProps {
  targetRef: RefObject<HTMLElement | null>
  filename: string
  label?: string
}

export function ImageExport({ targetRef, filename, label }: ImageExportProps) {
  const [busy, setBusy] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  async function captureWithSize(size: FontSizeOption) {
    setShowPicker(false)
    const el = targetRef.current
    if (!el) return

    setBusy(true)
    const scale = FONT_SCALE[size]
    let prevFontSize = ''

    try {
      if (scale !== 1) {
        const computed = parseFloat(window.getComputedStyle(el).fontSize)
        prevFontSize = el.style.fontSize
        el.style.fontSize = `${(computed * scale).toFixed(1)}px`
        // Allow browser to reflow before capture
        await new Promise((r) => setTimeout(r, 160))
      }

      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(el, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: (node) => {
          if (node instanceof HTMLElement) return !node.classList.contains('no-capture')
          return true
        },
      })

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`
      a.click()
    } catch {
      // silently ignore — element may not be renderable (e.g. canvas taint)
    } finally {
      if (scale !== 1) el.style.fontSize = prevFontSize
      setBusy(false)
    }
  }

  return (
    <div className="relative no-capture no-print">
      <button
        onClick={() => setShowPicker(true)}
        disabled={busy}
        title="Export as PNG image"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
        {label ?? 'Image'}
      </button>

      {showPicker && (
        <FontSizePicker
          onSelect={captureWithSize}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
