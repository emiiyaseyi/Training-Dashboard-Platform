'use client'

import { computeSelectedTools, computeTrainingPriorityTools, TOOL_SECTION_KEYS } from '@/lib/pdp-wrapup'
import type { PDPQuestion } from '@/components/pdp/PDPSectionRenderer'

interface Section { key: string; title: string; questions: PDPQuestion[] }

// Line managers validate Section B (the actual development plan) — they don't re-walk the full
// 24+ question Digital Skill Assessment question by question, which was the complaint this
// replaced ("they will just see a summary... based on the filled [assessment]"). This reads the
// employee's own Section A answers (never editable here) down to: which tools they said they need
// training on, their self-rated level in each, and the priority order they set — everything a
// manager needs to sanity-check the plan without re-litigating 60+ answers.
export function PDPSkillGapSummary({
  sections, answers, staffName, bare,
}: {
  sections: Section[]
  answers: Record<string, string | string[]>
  staffName: string
  // Drops the card wrapper for contexts that already sit inside one (e.g. the Track B per-member
  // page, which renders one section's content per "page" inside a single shared card).
  bare?: boolean
}) {
  const toolSections = sections.filter((s) => TOOL_SECTION_KEYS.includes(s.key))
  const selected = computeSelectedTools(sections, answers)
  const rows = toolSections
    .filter((s) => selected.includes(s.title))
    .map((s) => {
      const overallQ = s.questions.find((q) => q.label.startsWith('Overall, how would you rate'))
      const trainQ = s.questions.find((q) => q.label.startsWith('Do you require training'))
      return {
        tool: s.title,
        overall: overallQ ? (answers[overallQ.id] as string) || null : null,
        needsTraining: trainQ ? answers[trainQ.id] === 'Yes' : false,
      }
    })

  const priorityTools = computeTrainingPriorityTools(sections, answers)
  const wrapup = sections.find((s) => s.key === 'digital_skill_wrapup')
  const rankingAnswer = wrapup ? answers[wrapup.questions[0]?.id] : undefined
  const orderedPriority = Array.isArray(rankingAnswer) && rankingAnswer.length > 0
    ? rankingAnswer.filter((t) => priorityTools.includes(t))
    : priorityTools

  if (rows.length === 0) return null

  return (
    <div className={bare ? '' : 'bg-white border border-slate-200 rounded-xl p-5 mb-4'}>
      <p className="text-[18px] font-semibold text-slate-800 mb-1">Digital Skill Assessment Summary</p>
      <p className="text-[14px] text-slate-400 mb-3">
        {staffName.split(' ')[0]}&apos;s self-assessment (Section A). Captured here for context, not editable, you validate the Personal Development Plan below (Section B).
      </p>
      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.tool} className="px-3 py-2 text-[15px] flex items-center justify-between gap-2">
            <span className="text-slate-700">{r.tool}</span>
            <span className="text-slate-400 shrink-0">
              {r.overall || 'Not rated'}{r.needsTraining ? ', training requested' : ''}
            </span>
          </div>
        ))}
      </div>
      {orderedPriority.length > 0 && (
        <div className="mt-3">
          <p className="text-[14px] font-medium text-slate-600 mb-1">Training priority order (as set by {staffName.split(' ')[0]})</p>
          <ol className="list-decimal list-inside text-[15px] text-slate-700 space-y-0.5">
            {orderedPriority.map((t) => <li key={t}>{t}</li>)}
          </ol>
        </div>
      )}
    </div>
  )
}
