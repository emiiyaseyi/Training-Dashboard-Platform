'use client'

import { useEffect, useState } from 'react'
import { Sheet, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'

interface TaStatus {
  emailConfigured: boolean
  keyConfigured: boolean
  sheetIdConfigured: boolean
  serviceAccountEmail: string | null
  connected: boolean
  connectionError: string | null
  usingSampleData: boolean
  tabRowCounts: {
    hires: number; pipeline: number; internalMobility: number; conversions: number; notConverted: number; vacancies: number
  } | null
  tabErrors: Partial<Record<'pipeline' | 'internalMobility' | 'conversions' | 'notConverted' | 'vacancies', string>> | null
  unrecognizedOfferStatuses: { value: string; count: number }[] | null
}

const TA_TAB_LABELS: { key: keyof NonNullable<TaStatus['tabRowCounts']>; sheetName: string; required: boolean }[] = [
  { key: 'hires', sheetName: 'Hires', required: true },
  { key: 'pipeline', sheetName: 'Pipeline', required: false },
  { key: 'internalMobility', sheetName: 'Internal Mobility', required: false },
  { key: 'conversions', sheetName: 'Conversion', required: false },
  { key: 'notConverted', sheetName: 'Not Converted', required: false },
  { key: 'vacancies', sheetName: 'Vacancies 2026', required: false },
]

// The TA Google Sheet connection/diagnostics card — pulled out of a page component so it can be
// rendered on the TA-specific admin page without duplicating its fetch/refresh logic anywhere
// else that might ever want it.
export function TaSheetConnectionCard() {
  const [taStatus, setTaStatus] = useState<TaStatus | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadTaStatus = () => fetch('/api/hr/admin/ta-status').then((r) => (r.ok ? r.json() : Promise.reject(r)))

  useEffect(() => {
    loadTaStatus().then(setTaStatus).catch(() => setLoadError('Could not load the Talent Acquisition sheet status.'))
  }, [])

  // getTaDashboardData() fetches the Google Sheet live on every call — there's no cache to bust,
  // so re-checking the connection is just re-running the same request the page loaded with. Lets
  // the admin confirm a just-edited sheet (new tab, renamed tab, added rows) without a full reload.
  const refresh = () => {
    setRefreshing(true)
    loadTaStatus()
      .then(setTaStatus)
      .catch(() => setLoadError('Could not refresh the Talent Acquisition sheet status.'))
      .finally(() => setRefreshing(false))
  }

  return (
    <div className="bg-white border border-meristem-100 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Sheet className="w-4 h-4 text-meristem-700" />
          <p className="text-sm font-bold text-slate-800">Google Sheet Connection</p>
        </div>
        {taStatus && (
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium text-meristem-700 bg-meristem-50 hover:bg-meristem-100 disabled:opacity-60 rounded-lg px-3 py-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Checking…' : 'Re-check sheet'}
          </button>
        )}
      </div>

      {loadError && <p className="text-sm text-rose-600 mb-3">{loadError}</p>}

      {!taStatus ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatusRow label="TA_GOOGLE_SERVICE_ACCOUNT_EMAIL" ok={taStatus.emailConfigured} />
            <StatusRow label="TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" ok={taStatus.keyConfigured} />
            <StatusRow label="TA_GOOGLE_SHEET_ID" ok={taStatus.sheetIdConfigured} />
          </div>

          {taStatus.emailConfigured && taStatus.keyConfigured && taStatus.sheetIdConfigured && (
            <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${taStatus.connected ? 'bg-meristem-50 text-meristem-800' : 'bg-rose-50 text-rose-700'}`}>
              {taStatus.connected ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>
                <p className="font-semibold">{taStatus.connected ? 'Connected — live data is showing on the Talent Acquisition pages.' : 'Connection failed — showing sample data on the Talent Acquisition pages.'}</p>
                {taStatus.connectionError && <p className="mt-1">{taStatus.connectionError}</p>}
              </div>
            </div>
          )}

          {taStatus.unrecognizedOfferStatuses && taStatus.unrecognizedOfferStatuses.length > 0 && (
            <div className="bg-rose-50 text-rose-700 rounded-xl p-3 text-xs space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Hires!Offer Status has values that don&apos;t match Accepted/Declined/Pending/Withdrawn:</p>
              <ul className="pl-5 list-disc space-y-0.5">
                {taStatus.unrecognizedOfferStatuses.map((u) => (
                  <li key={u.value}><span className="font-mono">&quot;{u.value}&quot;</span> — {u.count} row{u.count === 1 ? '' : 's'} (counted as Pending)</li>
                ))}
              </ul>
              <p>Fix these in the sheet (or ask for the exact wording to be added as a recognized synonym) — Total Offers Accepted and everything derived from it (time to fill, cost of hire, acceptance rate) excludes these rows until then.</p>
            </div>
          )}

          {taStatus.tabRowCounts && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">Rows found per tab — 0 usually means that tab is missing or misnamed, not that it&apos;s genuinely empty:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TA_TAB_LABELS.map((t) => {
                  const count = taStatus.tabRowCounts![t.key]
                  const missing = count === 0
                  const error = t.key === 'hires' ? undefined : taStatus.tabErrors?.[t.key]
                  return (
                    <div key={t.key} className={`rounded-lg border px-2.5 py-1.5 text-xs ${missing ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-meristem-100 bg-meristem-50/60 text-slate-700'}`}>
                      <p className="font-medium">{t.sheetName}{t.required ? ' *' : ''}</p>
                      <p className="tabular-nums">{count} row{count === 1 ? '' : 's'}</p>
                      {error && <p className="mt-0.5 text-[10px] leading-snug text-amber-700/90">{error}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {taStatus.serviceAccountEmail && (
            <p className="text-xs text-slate-500">
              Service account: <span className="font-mono text-slate-700">{taStatus.serviceAccountEmail}</span> — share the recruitment Google Sheet with this address as at least Viewer.
            </p>
          )}

          {(!taStatus.emailConfigured || !taStatus.keyConfigured || !taStatus.sheetIdConfigured) && (
            <div className="bg-amber-50 text-amber-700 rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Missing environment variable(s) — set these in Vercel (Project → Settings → Environment Variables → Production), then redeploy:</p>
              </div>
              <ul className="pl-6 list-disc space-y-1">
                <li><span className="font-mono">TA_GOOGLE_SERVICE_ACCOUNT_EMAIL</span> — the service account&apos;s email address (from the downloaded JSON key file&apos;s <span className="font-mono">client_email</span> field).</li>
                <li><span className="font-mono">TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</span> — the same JSON file&apos;s <span className="font-mono">private_key</span> value, pasted in full (including the BEGIN/END lines) directly into Vercel — never through chat.</li>
                <li><span className="font-mono">TA_GOOGLE_SHEET_ID</span> — the ID from the sheet&apos;s URL (the long string between <span className="font-mono">/d/</span> and <span className="font-mono">/edit</span>).</li>
              </ul>
              <p>The sheet also needs to be shared with that service account email as at least Viewer, with tabs named <span className="font-mono">Hires</span>, <span className="font-mono">Pipeline</span>, <span className="font-mono">Config</span>, <span className="font-mono">Internal Mobility</span>, <span className="font-mono">Conversion</span>, <span className="font-mono">Not Converted</span>, and <span className="font-mono">Vacancies 2026</span>.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium ${ok ? 'bg-meristem-50 text-meristem-800' : 'bg-rose-50 text-rose-700'}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
      <span className="font-mono truncate">{label}</span>
    </div>
  )
}
