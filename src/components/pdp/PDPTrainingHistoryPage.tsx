'use client'

interface TrainingHistoryItem { trainingName: string; capability: string | null; month: string }

// Its own page, positioned right before Section B (Personal Development Plan) starts, so it reads
// as "here's what you've already had, now plan what's next" immediately before the development
// needs questions that should build on it. Always shown, even with nothing to list (explicit
// per L&D: an empty history is itself useful information, not a page to skip).
export function PDPTrainingHistoryPage({
  trainingHistory2026: trainingHistory2026Prop,
}: {
  trainingHistory2026: TrainingHistoryItem[]
}) {
  // A link generated before this field existed on PDPPrefillSnapshot has a stored prefillSnapshot
  // JSON with no trainingHistory2026 key at all — defaulting here keeps an older link from
  // crashing instead of just showing "no training on file", which it doesn't actually know either
  // way for a snapshot that old.
  const trainingHistory2026 = Array.isArray(trainingHistory2026Prop) ? trainingHistory2026Prop : []
  return (
    <div>
      <h2 className="text-[18px] font-semibold text-slate-800 mb-1">2026 Learning Interventions Attended</h2>
      <p className="text-[14px] text-slate-400 mb-2">For reference: the development needs you select on the next pages should build on this, not repeat it.</p>
      {trainingHistory2026.length === 0 ? (
        <p className="text-[15px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">No training on file for 2026.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
          {trainingHistory2026.map((t, i) => (
            <div key={i} className="px-3 py-2 text-[15px] flex items-center justify-between gap-2">
              <span className="text-slate-700">{t.trainingName}</span>
              <span className="text-slate-400 shrink-0">{t.capability ? `${t.capability}, ` : ''}{t.month}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
