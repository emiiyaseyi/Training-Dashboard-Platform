import { AlertTriangle } from 'lucide-react'

/** Shown whenever TA_GOOGLE_SHEET_ID/credentials aren't set yet — the numbers on the page below
 * are deterministic sample data (see lib/ta-sample-data.ts), never presented as if they were the
 * real recruitment sheet. */
export function TaSampleDataBanner() {
  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-bold text-amber-800">Showing sample data</p>
        <p className="text-xs text-amber-700 mt-0.5">
          TA_GOOGLE_SERVICE_ACCOUNT_EMAIL / TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / TA_GOOGLE_SHEET_ID aren&apos;t set yet — every figure on this page is generated demo data, not your real recruitment sheet.
        </p>
      </div>
    </div>
  )
}
