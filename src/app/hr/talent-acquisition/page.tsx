import { UserSearch } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'

// Temporary placeholder — the real Talent Acquisition dashboard is being ported in from
// github.com/emiiyaseyi/Talent-Recruitment-Dashboard (real Google Sheet already connected on
// that end) as the very next piece of work, not a stand-in like the other placeholder units.
export default function TalentAcquisitionPage() {
  return (
    <div>
      <UnitPageHeader title="Talent Acquisition" description="Hiring pipeline, time to fill, cost of hire" icon={UserSearch} />
      <div className="p-4 sm:p-8">
        <div className="bg-white border border-meristem-100 rounded-2xl p-6 max-w-xl text-center">
          <UserSearch className="w-8 h-8 text-meristem-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Being ported in now</p>
          <p className="text-xs text-slate-500 mt-1">
            This unit is being built from your existing Talent Recruitment Dashboard, connected to the real recruitment sheet — not a placeholder like the other units.
          </p>
        </div>
      </div>
    </div>
  )
}
