'use client'

import { useEffect, useState } from 'react'
import { Loader2, ChevronDown, ChevronUp, AlertTriangle, Trash2 } from 'lucide-react'

interface Entry {
  responseId: string
  attendeeId: string
  staffId: string
  staffName: string
  businessUnit: string
  trainingName: string
  stage: string
  submittedAt: string
  isLegacyImport: boolean
}

const STAGE_LABELS: Record<string, string> = { pre: 'Pre-Training', post1: 'Post-1', post2: 'Post-2' }

// Group-wide review of duplicate SurveyResponses — same person, same training, same stage,
// appearing more than once — whether they came from a live submission (e.g. an attendee added
// twice to the same schedule) or an import of pre-existing spreadsheet data (see
// import-legacy-manager-reviews/import-legacy-feedback). Deliberately manual: an admin reviews
// each group and picks which entry to remove, rather than this silently auto-resolving anything,
// since only a human can tell a genuine accidental duplicate apart from two real, separate
// attendances.
export function DuplicateSurveyResponsesPanel() {
  const [expanded, setExpanded] = useState(false)
  const [groups, setGroups] = useState<Entry[][] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/training-schedule/duplicate-responses')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load duplicates.')
      setGroups(json.groups)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load duplicates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const removeEntry = async (entry: Entry) => {
    if (!confirm(
      `Delete this ${STAGE_LABELS[entry.stage] || entry.stage} response for ${entry.staffName} (submitted ${new Date(entry.submittedAt).toLocaleString()})?\n\n` +
      `This removes that submission and, if it fed a Manager Review/Feedback record, ${entry.isLegacyImport ? 'un-links that record (it stays in the database as an un-imported row)' : 'deletes that record too'}. The other entry in this group is left untouched.`
    )) return
    setDeletingId(entry.responseId)
    try {
      const res = await fetch(`/api/admin/training-schedule/duplicate-responses/${entry.responseId}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to delete.')
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mb-5 border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold text-navy-700 bg-slate-50 hover:bg-slate-100"
      >
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" />
          Duplicate Survey Responses
          {groups && groups.length > 0 && (
            <span className="text-[11px] font-semibold text-white bg-red-500 rounded-full px-1.5 py-0.5 ml-1">{groups.length}</span>
          )}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-navy-600" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : !groups || groups.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">No duplicates found — every (person, training, stage) combination has exactly one response.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((entries) => (
                <div key={`${entries[0].stage}-${entries[0].staffId}-${entries[0].trainingName}`} className="border border-amber-200 bg-amber-50/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-700 mb-2">
                    {entries[0].staffName} <span className="text-slate-400">({entries[0].staffId})</span> — {entries[0].trainingName} — {STAGE_LABELS[entries[0].stage] || entries[0].stage}
                    <span className="text-slate-400"> · {entries.length} responses</span>
                  </p>
                  <div className="space-y-1.5">
                    {entries.map((e) => (
                      <div key={e.responseId} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <span className="text-xs text-slate-600">
                          Submitted {new Date(e.submittedAt).toLocaleString()}
                          {e.isLegacyImport && <span className="ml-1.5 text-[10px] font-medium text-navy-500 bg-navy-50 border border-navy-200 rounded-full px-1.5 py-0.5">Legacy import</span>}
                        </span>
                        <button
                          onClick={() => removeEntry(e)}
                          disabled={deletingId === e.responseId}
                          className="flex items-center gap-1 text-[11px] font-medium text-red-600 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === e.responseId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Delete this one
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
