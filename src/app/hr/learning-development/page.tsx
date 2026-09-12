import Link from 'next/link'
import { GraduationCap, ArrowUpRight } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'

// L&D's "full report" IS the existing Learning Intelligence dashboard — not rebuilt here. This
// page is a thin HR-context landing spot (summary + a way in), per the brief: "one can click on
// any of the unit name... to access the full report in each unit."
export default function LearningDevelopmentUnitPage() {
  return (
    <div>
      <UnitPageHeader
        title="Learning & Development"
        description="Training investment, coverage & impact"
        icon={GraduationCap}
      />
      <div className="p-4 sm:p-8">
        <div className="bg-white border border-meristem-100 rounded-2xl p-6 max-w-xl">
          <p className="text-sm text-slate-600">
            L&amp;D already has a full, dedicated dashboard — Executive Overview, Training Analytics,
            Subscriptions, Business Units, Capability Coverage, Talent Members, and Report Generation —
            built and maintained separately from this HR section.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-meristem-600 rounded-lg px-4 py-2 hover:bg-meristem-700"
          >
            Open the full Learning Intelligence dashboard <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
