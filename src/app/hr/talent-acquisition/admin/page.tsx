'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { ErrorState } from '@/components/ui/ErrorState'
import { TaSheetConnectionCard } from '@/components/hr/ta/TaSheetConnectionCard'
import { usePagePermission } from '@/lib/use-page-permission'

// Mirrors the Talent Management admin page's shape (own sub-route, back link, header, and — per
// explicit instruction — the same access-right scheme: gated on canAdmin for this unit's page
// permission, same as TM Admin and every other HR unit admin page, rather than isSuperAdmin only.
export default function TalentAcquisitionAdminPage() {
  const { status } = useSession()
  const { canAdmin } = usePagePermission()

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
        <p className="text-xs text-slate-500 mt-0.5">Google Sheet connection, credentials, and per-tab diagnostics for the recruitment data source.</p>
      </div>

      <TaSheetConnectionCard />
    </div>
  )
}
