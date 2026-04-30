'use client'

import { useState, useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import { loadSignatureSettings, type SignatureSettings } from '@/lib/signature-settings'

export interface PDFPrintOptions {
  orientation: 'portrait' | 'landscape'
  scale: 'normal' | 'large'
}

interface PDFOptionsModalProps {
  title: string
  subtitle?: string        // e.g. period label
  onConfirm: (opts: PDFPrintOptions) => void
  onClose: () => void
}

export function PDFOptionsModal({ title, subtitle, onConfirm, onClose }: PDFOptionsModalProps) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [scale, setScale] = useState<'normal' | 'large'>('large')
  const [sig, setSig] = useState<SignatureSettings | null>(null)

  useEffect(() => { setSig(loadSignatureSettings()) }, [])

  function confirm() {
    onConfirm({ orientation, scale })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 no-print">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Export PDF</p>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">Print Options</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Report info */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-0.5">Report</p>
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>

          {/* Page orientation */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Page Orientation</p>
            <div className="grid grid-cols-2 gap-2">
              {(['portrait', 'landscape'] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOrientation(o)}
                  className={`flex flex-col items-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    orientation === o ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-blue-200'
                  }`}
                >
                  {/* Mini page icon */}
                  <div className={`border-2 rounded ${
                    o === 'portrait' ? 'w-6 h-8' : 'w-10 h-6'
                  } ${orientation === o ? 'border-blue-500 bg-blue-100' : 'border-slate-300 bg-slate-100'}`} />
                  {o === 'portrait' ? 'Portrait (A4)' : 'Landscape (A4)'}
                </button>
              ))}
            </div>
          </div>

          {/* Text scale */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Text Size</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'normal', label: 'Standard', desc: 'More content per page' },
                { key: 'large',  label: 'Large',    desc: 'Easier to read' },
              ] as const).map(({ key, label, desc }) => (
                <button
                  key={key}
                  onClick={() => setScale(key)}
                  className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    scale === key ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-200'
                  }`}
                >
                  <p className={`text-sm font-semibold ${scale === key ? 'text-blue-700' : 'text-slate-700'}`}>{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Signature preview */}
          {sig && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Signature Block</p>
              <div className="grid grid-cols-2 gap-4 text-xs text-slate-600">
                <div>
                  <p className="font-semibold">{sig.primaryTitle || 'Primary Signer'}</p>
                  {sig.primaryName && <p>{sig.primaryName}</p>}
                </div>
                {sig.secondaryTitle && (
                  <div>
                    <p className="font-semibold">{sig.secondaryTitle}</p>
                    {sig.secondaryName && <p>{sig.secondaryName}</p>}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Signature settings are configured in Admin Settings.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={confirm} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  )
}
