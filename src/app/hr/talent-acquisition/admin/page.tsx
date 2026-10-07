'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { ErrorState } from '@/components/ui/ErrorState'
import { TaSheetConnectionCard } from '@/components/hr/ta/TaSheetConnectionCard'

// Mirrors the Talent Management admin page's shape (own sub-route, back link, header), but the
// content here is just the Google Sheet connection/credential diagnostics — TA has no DB-backed
// records to edit (see ta-sheets.ts's file header: it's a live per-request fetch, nothing is
// persisted), so there's no roster/record editor to port over. Gated on isSuperAdmin, same as the
// underlying /api/hr/admin/ta-status route — this is infrastructure/credential status, not
// something a unit-level TA admin necessarily needs either (see that route's own comment).
export default function TalentAcquisitionAdminPage() {
  const { data: session, status } = useSession()
  const isSuperAdmin = session?.user?.isSuperAdmin

  if (status === 'loading') return null

  if (!isSuperAdmin) {
    return (
      <ErrorState
        icon={ShieldAlert}
        iconClassName="text-meristem-200"
        title="Access restricted"
        description="Talent Acquisition admin settings are visible to Super Admins only."
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
