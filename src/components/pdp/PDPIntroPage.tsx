'use client'

// Page 1 of both tracks' forms: read-only employee context (Section 1 of the source draft,
// system-rendered from the roster, never an editable question). The 2026 Learning Interventions
// list used to live here too; it's now its own page (PDPTrainingHistoryPage) positioned right
// before Section B, since it's reference material for Section B's development needs, not for
// Section A's skill assessment.
export function PDPIntroPage({
  staffName, staffId, businessUnit, department, role, lineManagerName,
}: {
  staffName: string
  staffId?: string
  businessUnit: string
  department: string | null
  role: string | null
  lineManagerName?: string | null
}) {
  return (
    <div className="space-y-4">
      <div className="bg-navy-50 border border-navy-100 rounded-lg px-3.5 py-3">
        <p className="text-[15px] font-medium text-navy-800 mb-1">Before you start</p>
        <p className="text-[14px] text-navy-700 leading-relaxed">This form has two parts.</p>
        <p className="text-[14px] text-navy-700 leading-relaxed mt-1.5">
          <strong>Section A, Digital Skill Assessment:</strong> rates your comfort with core workplace tools (Word, Excel, Teams, AI tools, and more).
        </p>
        <p className="text-[14px] text-navy-700 leading-relaxed mt-1.5">
          <strong>Section B, Personal Development Plan:</strong> captures your 2027 development needs.
        </p>
        <p className="text-[14px] text-navy-700 leading-relaxed mt-1.5">
          Work through both in order. Your progress saves automatically as you go, so it&apos;s fine to close the tab and come back.
        </p>
      </div>

      <div>
        <h2 className="text-[18px] font-semibold text-slate-800 mb-2">Employee Information</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[18px]">
          <div><dt className="text-[14px] text-slate-400">Name</dt><dd className="text-slate-700">{staffName}</dd></div>
          {staffId && <div><dt className="text-[14px] text-slate-400">Staff ID</dt><dd className="text-slate-700">{staffId}</dd></div>}
          <div><dt className="text-[14px] text-slate-400">Business Unit</dt><dd className="text-slate-700">{businessUnit || '-'}</dd></div>
          <div><dt className="text-[14px] text-slate-400">Department</dt><dd className="text-slate-700">{department || '-'}</dd></div>
          <div><dt className="text-[14px] text-slate-400">Role</dt><dd className="text-slate-700">{role || '-'}</dd></div>
          {lineManagerName !== undefined && <div><dt className="text-[14px] text-slate-400">Line Manager</dt><dd className="text-slate-700">{lineManagerName || '-'}</dd></div>}
        </dl>
      </div>
    </div>
  )
}
