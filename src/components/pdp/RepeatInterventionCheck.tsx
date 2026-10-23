'use client'

import { AlertTriangle } from 'lucide-react'

export const REPEAT_REASON_KEY = '__repeatReason'
const REPEAT_REASON_OPTIONS = ['Mid Level', 'Advanced Level', 'Change in role', 'Expectations', 'Other']

export interface TrainingHistoryItem { trainingName: string; capability: string | null; month: string }

// A development need's chosen area/capability may have already been covered by a 2026 Learning
// Intervention (shown on page 1) — this flags that overlap and requires a reason before the
// respondent can move on, rather than silently letting a duplicate request through. Reused
// identically on Track A, Track B, and the manager validate page (anywhere a need's area can be
// set or changed), so the rule is consistent everywhere capabilities get picked.
export function findRepeatedCapability(area: string | undefined, trainingHistory2026: TrainingHistoryItem[]): TrainingHistoryItem | null {
  if (!area) return null
  const match = trainingHistory2026.find((t) => t.capability && t.capability.toLowerCase() === area.toLowerCase())
  return match || null
}

export function repeatReasonSatisfied(reason: string | undefined): boolean {
  if (!reason) return false
  if (reason === 'Other') return false // bare "Other" with no typed text isn't a reason yet
  return true
}

export function RepeatInterventionCheck({
  match, reason, onChange,
}: {
  match: TrainingHistoryItem
  reason: string
  onChange: (reason: string) => void
}) {
  const isOther = reason.startsWith('Other')
  const otherText = isOther ? reason.replace(/^Other:\s*/, '').replace(/^Other$/, '') : ''

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 mt-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[15px] text-amber-800">
          <strong>{match.capability}</strong> was already covered by a 2026 Learning Intervention (&quot;{match.trainingName}&quot;, {match.month}). Please explain why this needs to be repeated.
        </p>
      </div>
      <label className="block text-[15px] font-medium text-amber-800 mt-2 mb-1">
        Reason for repeating <span className="text-red-500">*</span>
      </label>
      <select
        value={isOther ? 'Other' : reason}
        onChange={(e) => onChange(e.target.value === 'Other' ? 'Other' : e.target.value)}
        className="w-full border border-amber-300 rounded-md px-2.5 py-2 text-[18px] bg-white"
      >
        <option value="">Select a reason…</option>
        {REPEAT_REASON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {isOther && (
        <input
          value={otherText}
          onChange={(e) => onChange(e.target.value.trim() ? `Other: ${e.target.value}` : 'Other')}
          placeholder="Please specify"
          className="w-full border border-amber-300 rounded-md px-2.5 py-2 text-[18px] mt-2 bg-white"
        />
      )}
    </div>
  )
}
