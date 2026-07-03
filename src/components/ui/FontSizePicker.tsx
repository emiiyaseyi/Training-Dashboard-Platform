'use client'

import { useEffect, useRef } from 'react'

export type FontSizeOption = 'small' | 'normal' | 'large'

interface Props {
  onSelect: (size: FontSizeOption) => void
  onCancel: () => void
}

export function FontSizePicker({ onSelect, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel()
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [onCancel])

  return (
    <div
      ref={ref}
      className="absolute z-50 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-52 no-capture"
    >
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">
        Text size for export
      </p>
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => onSelect('small')}
          className="flex-1 flex flex-col items-center py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          <span className="text-[11px] font-bold text-slate-500 leading-none">A</span>
          <span className="text-[9px] text-slate-400 mt-1">Smaller</span>
        </button>
        <button
          onClick={() => onSelect('normal')}
          className="flex-1 flex flex-col items-center py-2.5 rounded-lg border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          <span className="text-sm font-bold text-blue-600 leading-none">A</span>
          <span className="text-[9px] text-blue-500 mt-1">Normal</span>
        </button>
        <button
          onClick={() => onSelect('large')}
          className="flex-1 flex flex-col items-center py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          <span className="text-base font-bold text-slate-700 leading-none">A</span>
          <span className="text-[9px] text-slate-400 mt-1">Larger</span>
        </button>
      </div>
      <button
        onClick={onCancel}
        className="w-full text-[10px] text-slate-400 hover:text-slate-600 transition-colors py-1"
      >
        Cancel
      </button>
    </div>
  )
}
