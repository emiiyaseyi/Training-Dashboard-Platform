'use client'

import { useEffect, useState } from 'react'
import { Sheet, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'

interface ConfigState {
  spreadsheetUrl: string
  trainingSheetName: string
  feedbackSheetName: string
  subscriptionSheetName: string
  kssSheetName: string
  autoSyncEnabled: boolean
  syncFrequencyMinutes: number
}

interface ValidateError {
  sheet: string
  message: string
}

interface KeyDiagnostics {
  configured: boolean
  rawLength: number
  hasBeginMarker: boolean
  hasEndMarker: boolean
  wrappedInQuotes: boolean
  containsLiteralBackslashN: boolean
  containsRealNewline: boolean
  lineCount: number
  normalizedParses: boolean
}

const DEFAULT_STATE: ConfigState = {
  spreadsheetUrl: '',
  trainingSheetName: 'Training Cost',
  feedbackSheetName: 'Feedback',
  subscriptionSheetName: 'Subscriptions',
  kssSheetName: 'KSS',
  autoSyncEnabled: false,
  syncFrequencyMinutes: 60,
}

export function GoogleSheetsPanel() {
  const [state, setState] = useState<ConfigState>(DEFAULT_STATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [serverHasCredentials, setServerHasCredentials] = useState<boolean | null>(null)
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null)
  const [keyDiagnostics, setKeyDiagnostics] = useState<KeyDiagnostics | null>(null)
  const [lastStatus, setLastStatus] = useState<'success' | 'error' | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const [errors, setErrors] = useState<ValidateError[]>([])
  const [tabTitles, setTabTitles] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; imported: Record<string, number> } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/google-sheets')
      const data = await res.json()
      setState({
        spreadsheetUrl: data.spreadsheetUrl || '',
        trainingSheetName: data.trainingSheetName || DEFAULT_STATE.trainingSheetName,
        feedbackSheetName: data.feedbackSheetName || DEFAULT_STATE.feedbackSheetName,
        subscriptionSheetName: data.subscriptionSheetName || DEFAULT_STATE.subscriptionSheetName,
        kssSheetName: data.kssSheetName || DEFAULT_STATE.kssSheetName,
        autoSyncEnabled: !!data.autoSyncEnabled,
        syncFrequencyMinutes: data.syncFrequencyMinutes || 60,
      })
      setServerHasCredentials(!!data.serverHasCredentials)
      setServiceAccountEmail(data.serviceAccountEmail || null)
      setKeyDiagnostics(data.privateKeyDiagnostics || null)
      setLastStatus(data.lastSyncStatus || null)
      setLastCheckedAt(data.lastSyncedAt || null)
      setErrors(data.lastSyncErrors || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/admin/google-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const validate = async () => {
    setValidating(true)
    setErrors([])
    setTabTitles([])
    try {
      // Save first so the config isn't lost, then validate live against Google.
      await fetch('/api/admin/google-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      const res = await fetch('/api/admin/google-sheets/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      const data = await res.json()
      setErrors(data.errors || [])
      setTabTitles(data.tabTitles || [])
      setLastStatus(data.success ? 'success' : 'error')
      setLastCheckedAt(new Date().toISOString())
    } finally {
      setValidating(false)
    }
  }

  const syncNow = async () => {
    if (!confirm('Import new data from the spreadsheet now? Only rows that don’t already exist in the platform are added — existing records are left untouched.')) return
    setSyncing(true)
    setSyncResult(null)
    setErrors([])
    try {
      const res = await fetch('/api/admin/google-sheets/sync', { method: 'POST' })
      const data = await res.json()
      setSyncResult({ success: !!data.success, imported: data.imported || {} })
      setErrors(data.errors || [])
      setLastStatus(data.success ? 'success' : 'error')
      setLastCheckedAt(new Date().toISOString())
    } finally {
      setSyncing(false)
    }
  }

  const sheetFields: { key: keyof ConfigState; label: string }[] = [
    { key: 'trainingSheetName', label: 'Training Cost tab name' },
    { key: 'feedbackSheetName', label: 'Feedback tab name' },
    { key: 'subscriptionSheetName', label: 'Subscriptions tab name' },
    { key: 'kssSheetName', label: 'KSS tab name' },
  ]

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start gap-3 mb-4">
        <Sheet className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-slate-800">Live Data Source — Google Sheets</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Point the platform at a Google Sheet with one tab per data type. It will read the same columns as the
            Excel upload templates.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          {serverHasCredentials === false && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              No Google Service Account is configured on the server yet. Ask your developer to set
              <code className="mx-1 bg-amber-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and
              <code className="mx-1 bg-amber-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code>
              in the environment. Validation will fail until then.
            </div>
          )}
          {serverHasCredentials && serviceAccountEmail && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
              Share your spreadsheet (Viewer access) with:{' '}
              <span className="font-mono text-slate-700">{serviceAccountEmail}</span>
            </div>
          )}

          {keyDiagnostics?.configured && !keyDiagnostics.normalizedParses && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 space-y-1">
              <p className="font-medium">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY doesn&apos;t parse as a valid key.</p>
              <ul className="space-y-0.5 text-red-600">
                <li>Length: {keyDiagnostics.rawLength} characters, {keyDiagnostics.lineCount} line(s)</li>
                <li>Has &quot;BEGIN...PRIVATE KEY&quot; marker: {keyDiagnostics.hasBeginMarker ? 'yes' : 'no'}</li>
                <li>Has &quot;END...PRIVATE KEY&quot; marker: {keyDiagnostics.hasEndMarker ? 'yes' : 'no'}</li>
                <li>Wrapped in extra quotes: {keyDiagnostics.wrappedInQuotes ? 'yes — remove them' : 'no'}</li>
                <li>Contains real line breaks: {keyDiagnostics.containsRealNewline ? 'yes' : 'no'}</li>
                <li>Contains literal \n text: {keyDiagnostics.containsLiteralBackslashN ? 'yes' : 'no'}</li>
              </ul>
              <p>
                A correctly-pasted key is usually ~1,700 characters. If yours is much shorter, the paste was
                truncated — re-copy the full <code className="bg-red-100 px-1 rounded">private_key</code> value from
                the JSON file and re-save it in Vercel, then redeploy.
              </p>
            </div>
          )}
          {keyDiagnostics?.configured && keyDiagnostics.normalizedParses && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
              Private key format looks valid ({keyDiagnostics.rawLength} characters).
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Google Sheet link</label>
            <input
              value={state.spreadsheetUrl}
              onChange={(e) => setState({ ...state, spreadsheetUrl: e.target.value })}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sheetFields.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
                <input
                  value={state[key] as string}
                  onChange={(e) => setState({ ...state, [key]: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={state.autoSyncEnabled}
                onChange={(e) => setState({ ...state, autoSyncEnabled: e.target.checked })}
              />
              Sync automatically on a schedule
            </label>
            {state.autoSyncEnabled && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Every
                <select
                  value={state.syncFrequencyMinutes}
                  onChange={(e) => setState({ ...state, syncFrequencyMinutes: parseInt(e.target.value) })}
                  className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={360}>6 hours</option>
                  <option value={1440}>24 hours</option>
                </select>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saved ? 'Saved' : 'Save Settings'}
            </button>
            <button
              onClick={validate}
              disabled={validating || !state.spreadsheetUrl.trim()}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {validating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Validate Connection
            </button>
            <button
              onClick={syncNow}
              disabled={syncing || !state.spreadsheetUrl.trim()}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Sync Now
            </button>
          </div>

          {syncResult && (
            <div
              className={`text-xs rounded-lg px-3 py-2.5 border ${
                syncResult.success
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                  : 'text-amber-800 bg-amber-50 border-amber-200'
              }`}
            >
              {Object.keys(syncResult.imported).length > 0
                ? `Imported: ${Object.entries(syncResult.imported).map(([k, v]) => `${v} ${k}`).join(', ')}.`
                : 'No new records imported.'}
              {!syncResult.success && ' Some tabs had issues — see below.'}
            </div>
          )}

          {lastStatus && (
            <div
              className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2.5 border ${
                lastStatus === 'success'
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                  : 'text-red-700 bg-red-50 border-red-100'
              }`}
            >
              {lastStatus === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              )}
              <div className="space-y-1">
                <p>
                  {lastStatus === 'success'
                    ? 'All four tabs found with recognisable columns.'
                    : 'One or more issues found — fix these before relying on live sync:'}
                  {lastCheckedAt && (
                    <span className="text-slate-400"> (checked {new Date(lastCheckedAt).toLocaleString()})</span>
                  )}
                </p>
                {errors.map((e, i) => (
                  <p key={i}>
                    <span className="font-medium">{e.sheet}:</span> {e.message}
                  </p>
                ))}
                {tabTitles.length > 0 && (
                  <p className="text-slate-400">Tabs found in spreadsheet: {tabTitles.join(', ')}</p>
                )}
              </div>
            </div>
          )}

          {state.spreadsheetUrl && (
            <a
              href={state.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-navy-600"
            >
              <ExternalLink className="w-3 h-3" />
              Open spreadsheet
            </a>
          )}
        </div>
      )}
    </div>
  )
}
