import { AlertTriangle, XCircle } from 'lucide-react'

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

/** Shown when TA_* credentials ARE configured but the real connection failed (bad key, wrong
 * sheet ID, sheet not shared with the service account, or a tab/column that doesn't match the
 * expected Hires/Pipeline/Config schema) — the page falls back to sample data below rather than
 * crashing, but this makes the failure visible and actionable instead of silent. */
export function TaConnectionErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-2xl p-4">
      <XCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-bold text-rose-800">Couldn&apos;t connect to the Talent Acquisition sheet — showing sample data instead</p>
        <p className="text-xs text-rose-700 mt-0.5">{message}</p>
      </div>
    </div>
  )
}
