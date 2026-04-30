'use client'

import { useState, type RefObject } from 'react'
import { Camera, Loader2 } from 'lucide-react'

interface ImageExportProps {
  /** ref of the element to capture */
  targetRef: RefObject<HTMLElement | null>
  filename: string
  label?: string
}

export function ImageExport({ targetRef, filename, label }: ImageExportProps) {
  const [busy, setBusy] = useState(false)

  async function capture() {
    if (!targetRef.current) return
    setBusy(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(targetRef.current, {
        quality: 1,
        pixelRatio: 2,       // retina-quality output
        backgroundColor: '#ffffff',
        // exclude export/action buttons from the capture
        filter: (node) => {
          if (node instanceof HTMLElement) {
            return !node.classList.contains('no-capture')
          }
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
      setBusy(false)
    }
  }

  return (
    <button
      onClick={capture}
      disabled={busy}
      title="Export as PNG image"
      className="no-print flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
      {label ?? 'Image'}
    </button>
  )
}
