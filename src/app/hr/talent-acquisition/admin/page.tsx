'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { ErrorState } from '@/components/ui/ErrorState'
import { TaSheetConnectionCard } from '@/components/hr/ta/TaSheetConnectionCard'
import { TaAdminSectionTable } from '@/components/hr/ta/TaAdminSectionTable'
import { usePagePermission } from '@/lib/use-page-permission'

const DATA_SECTIONS = [
  { slug: 'hires', label: 'Hires' },
  { slug: 'pipeline', label: 'Pipeline' },
  { slug: 'internal-mobility', label: 'Internal Mobility' },
  { slug: 'conversion', label: 'Conversion' },
  { slug: 'not-converted', label: 'Not Converted' },
  { slug: 'vacancies', label: 'Vacancies' },
] as const

// Mirrors the Talent Management admin page's shape (own sub-route, back link, header, and — per
// explicit instruction — the same access-right scheme: gated on canAdmin for this unit's page
// permission, same as TM Admin and every other HR unit admin page, rather than isSuperAdmin only.
export default function TalentAcquisitionAdminPage() {
  const { status } = useSession()
  const { canAdmin } = usePagePermission()
  const [activeSection, setActiveSection] = useState<typeof DATA_SECTIONS[number]['slug']>('hires')

  if (status === 'loading') return null

  if (!canAdmin) {
    return (
      <ErrorState
        icon={ShieldAlert}
        iconClassName="text-meristem-200"
        title="Access restricted"
        description="You don't have admin access to Talent Acquisition."
        href="/hr/talent-acquisition"
        linkLabel="← Back to dashboard"
      />
    )
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <Link href="/hr/talent-acquisition" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Talent Acquisition
        </Link>
        <h1 className="text-lg font-bold text-slate-800">Talent Acquisition — Admin</h1>
        <p className="text-xs text-slate-500 mt-0.5">Google Sheet connection, credentials, per-tab diagnostics, and direct data editing for the recruitment data source.</p>
      </div>

      <TaSheetConnectionCard />

      <div>
        <p className="text-sm font-bold text-slate-800 mb-1">Data Editor</p>
        <p className="text-xs text-slate-500 mb-3">
          View, edit, add, or remove records directly on the live Google Sheet — every change here shows up on the TA dashboard pages immediately, and on the actual spreadsheet. Config (BU/Role/Office Type lookup lists) isn&apos;t covered here yet — edit those directly in the sheet&apos;s Config tab.
        </p>

        <div className="flex gap-1 overflow-x-auto border-b border-meristem-100 mb-4">
          {DATA_SECTIONS.map((s) => (
            <button
              key={s.slug}
              onClick={() => setActiveSection(s.slug)}
              className={`shrink-0 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                activeSection === s.slug ? 'border-meristem-600 text-meristem-800' : 'border-transparent text-slate-500 hover:text-meristem-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <TaAdminSectionTable key={activeSection} slug={activeSection} label={DATA_SECTIONS.find((s) => s.slug === activeSection)!.label} />
      </div>
    </div>
  )
}
