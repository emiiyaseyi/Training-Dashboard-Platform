'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, CheckCircle, XCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react'

interface FileUploadProps {
  endpoint: string
  label: string
  description: string
  onSuccess?: (recordCount: number) => void
}

type Status = 'idle' | 'uploading' | 'success' | 'error'

export function FileUpload({ endpoint, label, description, onSuccess }: FileUploadProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [recordCount, setRecordCount] = useState(0)
  const [period, setPeriod] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    setStatus('uploading')
    setMessage('')
    setWarnings([])

    const formData = new FormData()
    formData.append('file', file)
    if (period) formData.append('period', period)

    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Upload failed.')
        setWarnings(data.warnings ?? [])
      } else {
        setStatus('success')
        setRecordCount(data.recordCount)
        setMessage(`Successfully imported ${data.recordCount} records.`)
        setWarnings(data.warnings ?? [])
        onSuccess?.(data.recordCount)
      }
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }, [endpoint, period, onSuccess])

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setStatus('error')
      setMessage('Please upload an Excel (.xlsx, .xls) or CSV file.')
      return
    }
    upload(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const reset = () => {
    setStatus('idle')
    setMessage('')
    setWarnings([])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <h3 className="font-semibold text-slate-800 text-sm">{label}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>

      {/* Period input */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Period (optional) <span className="text-slate-400 font-normal">e.g. 2024 or 2024-Q1</span>
        </label>
        <input
          type="text"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="2024"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Drop zone */}
      {status === 'idle' || status === 'uploading' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          } ${status === 'uploading' ? 'pointer-events-none opacity-60' : ''}`}
        >
          {status === 'uploading' ? (
            <>
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600">Processing file...</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Upload className="w-5 h-5 text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Drop your Excel file here</p>
                <p className="text-xs text-slate-400 mt-0.5">or click to browse — .xlsx, .xls, .csv supported</p>
              </div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      ) : null}

      {/* Result state */}
      {status === 'success' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">{message}</p>
              <p className="text-xs text-green-600 mt-0.5">{recordCount} rows imported successfully.</p>
            </div>
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <p className="text-xs font-semibold text-amber-800">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</p>
              </div>
              <ul className="space-y-1">
                {warnings.slice(0, 5).map((w, i) => <li key={i} className="text-xs text-amber-700">• {w}</li>)}
                {warnings.length > 5 && <li className="text-xs text-amber-600">...and {warnings.length - 5} more</li>}
              </ul>
            </div>
          )}
          <button onClick={reset} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Upload another file
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800">{message}</p>
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <ul className="space-y-1">
                {warnings.map((w, i) => <li key={i} className="text-xs text-amber-700">• {w}</li>)}
              </ul>
            </div>
          )}
          <button onClick={reset} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Try again
          </button>
        </div>
      )}

      {/* File format hint */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <FileSpreadsheet className="w-3.5 h-3.5" />
        <span>Column headers are auto-detected — exact names are not required.</span>
      </div>
    </div>
  )
}
