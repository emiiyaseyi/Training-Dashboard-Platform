'use client'

interface TrainingHistoryItem { trainingName: string; capability: string | null; month: string }

// Page 1 of both tracks' forms: read-only employee context (Section 1 of the source draft —
// system-rendered from the roster, never an editable question) plus every 2026 Learning
// Intervention this person attended, shown as reference so they see what's already been
// addressed before picking new capabilities/needs in the sections that follow.
export function PDPIntroPage({
  staffName, staffId, businessUnit, department, role, lineManagerName, trainingHistory2026,
}: {
  staffName: string
  staffId?: string
  businessUnit: string
  department: string | null
  role: string | null
  lineManagerName?: string | null
  trainingHistory2026: TrainingHistoryItem[]
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Employee Information</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div><dt className="text-[11px] text-slate-400">Name</dt><dd className="text-slate-700">{staffName}</dd></div>
          {staffId && <div><dt className="text-[11px] text-slate-400">Staff ID</dt><dd className="text-slate-700">{staffId}</dd></div>}
          <div><dt className="text-[11px] text-slate-400">Business Unit</dt><dd className="text-slate-700">{businessUnit || '—'}</dd></div>
          <div><dt className="text-[11px] text-slate-400">Department</dt><dd className="text-slate-700">{department || '—'}</dd></div>
          <div><dt className="text-[11px] text-slate-400">Role</dt><dd className="text-slate-700">{role || '—'}</dd></div>
          {lineManagerName !== undefined && <div><dt className="text-[11px] text-slate-400">Line Manager</dt><dd className="text-slate-700">{lineManagerName || '—'}</dd></div>}
        </dl>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-1">2026 Learning Interventions Attended</h2>
        <p className="text-[11px] text-slate-400 mb-2">For reference — the capabilities and development needs you select on the next pages should build on this, not repeat it.</p>
        {trainingHistory2026.length === 0 ? (
          <p className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">No training on file for 2026.</p>
        ) : (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {trainingHistory2026.map((t, i) => (
              <div key={i} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                <span className="text-slate-700">{t.trainingName}</span>
                <span className="text-slate-400 shrink-0">{t.capability ? `${t.capability} · ` : ''}{t.month}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
