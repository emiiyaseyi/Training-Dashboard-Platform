'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { BookOpen, Loader2, CheckCircle2, AlertTriangle, Clock, Search, Pencil, ArrowLeft, Paperclip, Upload, X as XIcon } from 'lucide-react'

interface Question {
  id: string
  section: string | null
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'date' | 'yesno' | 'file'
  options: string[] | null
  ratingMax: number
  required: boolean
}

interface UploadedFile { fileName: string; webViewLink: string }

// Mirrors FileQuestionInput in /survey/[token]/[stage] — same "answer value is a JSON array of
// { fileName, webViewLink }" convention, just pointed at the Custom Survey upload endpoint.
function FileQuestionInput({ questionId, value, onChange }: { questionId: string; value: string; onChange: (v: string) => void }) {
  const params = useParams<{ token: string }>()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const files: UploadedFile[] = value ? (JSON.parse(value) as UploadedFile[]) : []

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('questionId', questionId)
      const res = await fetch(`/api/custom-survey/${params.token}/upload`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed.')
      onChange(JSON.stringify([...files, { fileName: data.fileName, webViewLink: data.webViewLink }]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const removeFile = (i: number) => onChange(JSON.stringify(files.filter((_, idx) => idx !== i)))

  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 border border-slate-300 rounded-lg px-4 py-2.5 text-[18px]">
          <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
          {/* Not a link — webViewLink now points at an admin-only download route (see
              UploadedFile in schema.prisma), which would 401 for the respondent viewing it. */}
          <span className="text-slate-700 truncate flex-1">{f.fileName}</span>
          <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-600 shrink-0">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
      <label className="flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-4 py-2.5 text-[18px] text-slate-500 cursor-pointer hover:bg-slate-50">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? 'Uploading…' : files.length > 0 ? 'Add another file' : 'Choose a file to upload'}
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.ppt,.pptx,.docx,.xlsx" className="hidden" disabled={uploading} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <p className="text-[13px] text-slate-400">Accepted: PDF, PNG, JPEG, PowerPoint, Word (.docx), or Excel (.xlsx). You can add more than one file.</p>
      {error && <p className="text-[14px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}

function SearchableSelect({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const allowCustom = options.some((o) => o.trim().toLowerCase() === 'other')
  const listOptions = options.filter((o) => o.trim().toLowerCase() !== 'other')
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)

  useEffect(() => { setQuery(value || '') }, [value])

  const q = query.trim().toLowerCase()
  const filtered = q ? listOptions.filter((o) => o.toLowerCase().includes(q)) : listOptions
  const exactMatch = listOptions.find((o) => o.toLowerCase() === query.trim().toLowerCase())

  const selectOption = (o: string) => {
    onChange(o)
    setQuery(o)
    setOpen(false)
    setCustomMode(false)
  }

  const base = 'w-full px-4 py-2.5 border border-slate-300 rounded-lg text-[18px] focus:outline-none focus:ring-2 focus:ring-navy-600'

  if (customMode) {
    return (
      <div>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(exactMatch || e.target.value) }}
          placeholder="Type here…"
          className={base}
        />
        {exactMatch ? (
          <p className="text-[14px] text-amber-600 mt-1">&quot;{exactMatch}&quot; is already in the list — using that instead of adding a duplicate.</p>
        ) : (
          <button type="button" onClick={() => { setCustomMode(false); setQuery(value || '') }} className="text-[14px] text-navy-600 mt-1 flex items-center gap-1 hover:underline">
            <ArrowLeft className="w-3 h-3" /> Back to the list
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search…"
          className={`${base} pl-10`}
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 && <p className="px-4 py-2.5 text-[16px] text-slate-400">No matches.</p>}
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectOption(o) }}
              className={`w-full text-left px-4 py-2.5 text-[16px] hover:bg-slate-50 ${o === value ? 'bg-navy-50 text-navy-700 font-medium' : 'text-slate-700'}`}
            >
              {o}
            </button>
          ))}
          {allowCustom && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setCustomMode(true); setQuery(''); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-[16px] text-navy-600 border-t border-slate-100 flex items-center gap-1.5 hover:bg-slate-50"
            >
              <Pencil className="w-3.5 h-3.5" /> Type if not found
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function QuestionInput({ q, value, onChange }: { q: Question; value: string | string[]; onChange: (v: string | string[]) => void }) {
  const base = 'w-full px-4 py-2.5 border border-slate-300 rounded-lg text-[18px] focus:outline-none focus:ring-2 focus:ring-navy-600'
  switch (q.type) {
    case 'textarea':
      return <textarea value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} rows={3} className={base} />
    case 'select':
      return <SearchableSelect options={q.options || []} value={(value as string) || ''} onChange={onChange} />
    case 'file':
      return <FileQuestionInput questionId={q.id} value={(value as string) || ''} onChange={onChange} />
    case 'multiselect': {
      const selected = Array.isArray(value) ? value : []
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-[18px] text-slate-600">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      )
    }
    case 'rating': {
      const max = q.ratingMax || 5
      return (
        <div>
          <p className="text-[14px] text-slate-400 mb-1.5">Rate from 1 (lowest) to {max} (highest)</p>
          <div className="flex items-center gap-2.5 flex-wrap">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => onChange(String(n))}
                className={`w-11 h-11 rounded-full border text-[18px] font-medium ${
                  String(value) === String(n) ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )
    }
    case 'yesno':
      return (
        <div className="flex items-center gap-2.5">
          {['Yes', 'No'].map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => onChange(o)}
              className={`px-5 py-2 rounded-lg border text-[18px] font-medium ${
                value === o ? 'bg-navy-600 text-white border-navy-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )
    case 'date':
      return <input type="date" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} className={base} />
    default:
      return <input type="text" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} className={base} />
  }
}

interface SurveyContext {
  valid: boolean
  title: string
  description: string | null
  recipientName: string
  alreadyResponded: boolean
  expired: boolean
  questions: Question[]
}

export default function CustomSurveyPage() {
  const params = useParams<{ token: string }>()
  const [context, setContext] = useState<SurveyContext | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    fetch(`/api/custom-survey/${params.token}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'This survey link is invalid.')
        setContext(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This survey link is invalid.'))
      .finally(() => setLoading(false))
  }, [params.token])

  const sections = useMemo(() => {
    const seen: string[] = []
    for (const q of context?.questions || []) {
      const s = q.section || ''
      if (!seen.includes(s)) seen.push(s)
    }
    return seen
  }, [context])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/custom-survey/${params.token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit.')
      setSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-navy-700 px-4 pt-10 pb-20">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-lg bg-gold-400 flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-navy-800" />
          </div>
          <p className="text-white font-semibold text-[23px]">Learning Intelligence</p>
          <p className="text-slate-400 text-[18px]">Survey</p>
        </div>

        <div className="bg-white rounded-xl shadow-xl p-8">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-navy-600" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center py-6">
              <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
              <p className="text-[18px] font-medium text-slate-800">{error}</p>
              <p className="text-[16px] text-slate-500 mt-1">If you think this is a mistake, contact your L&amp;D team.</p>
            </div>
          ) : !submitted && !context?.alreadyResponded && context?.expired ? (
            <div className="flex flex-col items-center text-center py-6">
              <Clock className="w-8 h-8 text-amber-500 mb-3" />
              <p className="text-[18px] font-medium text-slate-800">This survey has expired.</p>
              <p className="text-[16px] text-slate-500 mt-1">{context?.title}</p>
              <p className="text-[15px] text-slate-400 mt-2">If you still need to respond, contact your L&amp;D team.</p>
            </div>
          ) : submitted || context?.alreadyResponded ? (
            <div className="flex flex-col items-center text-center py-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-3" />
              <p className="text-[18px] font-medium text-slate-800">
                {submitted ? 'Thank you — your response has been submitted!' : 'You’ve already submitted this survey — thank you!'}
              </p>
              <p className="text-[16px] text-slate-500 mt-1">{context?.title}</p>
            </div>
          ) : context ? (
            <form onSubmit={handleSubmit}>
              <p className="text-[18px] text-slate-500">Hi {context.recipientName || 'there'},</p>
              <p className="text-[21px] font-semibold text-slate-800 mt-1">{context.title}</p>
              {context.description && <p className="text-[16px] text-slate-400 mt-0.5">{context.description}</p>}

              <div className="mt-6 space-y-6">
                {sections.map((section) => (
                  <div key={section}>
                    {section && <p className="text-[16px] font-semibold text-navy-600 uppercase tracking-wide mb-3">{section}</p>}
                    <div className="space-y-4">
                      {context.questions.filter((q) => (q.section || '') === section).map((q) => (
                        <div key={q.id}>
                          <label className="block text-[18px] text-slate-700 mb-1.5">
                            {q.label}
                            {q.required && <span className="text-red-500 ml-0.5">*</span>}
                          </label>
                          <QuestionInput
                            q={q}
                            value={answers[q.id] ?? (q.type === 'multiselect' ? [] : '')}
                            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {submitError && (
                <p className="mt-4 text-[16px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-navy-600 hover:bg-navy-700 text-white text-[18px] font-medium rounded-lg py-3 transition-colors disabled:opacity-60"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
