'use client'

import { useEffect, useState } from 'react'
import { Sheet, Loader2, CheckCircle2, AlertTriangle, ExternalLink, Undo2, History } from 'lucide-react'

interface ConfigState {
  spreadsheetUrl: string
  trainingSheetName: string
  feedbackSheetName: string
  subscriptionSheetName: string
  kssSheetName: string
  comprehensiveStaffListSheetName: string
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

interface SheetPreview {
  type: string
  label: string
  sheetName: string
  totalRows: number
  newRows: number
  alreadyImported: number
  sample: Record<string, string | number>[]
  error?: string
}

interface PreviewResult {
  success: boolean
  connectionError?: string
  spreadsheetTitle?: string
  sheets: SheetPreview[]
}

interface SyncLogEntry {
  id: string
  syncedAt: string
  trigger: 'manual' | 'scheduled'
  success: boolean
  imported: Record<string, number>
  errors: ValidateError[]
  undone: boolean
  undoneAt: string | null
}

const DEFAULT_STATE: ConfigState = {
  spreadsheetUrl: '',
  trainingSheetName: 'Training Cost',
  feedbackSheetName: 'Feedback',
  subscriptionSheetName: 'Subscriptions',
  kssSheetName: 'KSS',
  comprehensiveStaffListSheetName: '',
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
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; imported: Record<string, number> } | null>(null)
  const [history, setHistory] = useState<SyncLogEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [undoingId, setUndoingId] = useState<string | null>(null)

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
        comprehensiveStaffListSheetName: data.comprehensiveStaffListSheetName || '',
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

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/admin/google-sheets/sync-log')
      setHistory(await res.json())
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    load()
    loadHistory()
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

  const previewSync = async () => {
    setPreviewing(true)
    setPreview(null)
    setSyncResult(null)
    try {
      await fetch('/api/admin/google-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      const res = await fetch('/api/admin/google-sheets/preview', { method: 'POST' })
      setPreview(await res.json())
    } finally {
      setPreviewing(false)
    }
  }

  const confirmImport = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/google-sheets/sync', { method: 'POST' })
      const data = await res.json()
      setSyncResult({ success: !!data.success, imported: data.imported || {} })
      setErrors(data.errors || [])
      setLastStatus(data.success ? 'success' : 'error')
      setLastCheckedAt(new Date().toISOString())
      setPreview(null)
      await loadHistory()
    } finally {
      setSyncing(false)
    }
  }

  const undoSync = async (id: string) => {
    if (!confirm('Undo this sync? This permanently deletes every record it imported. This cannot be reversed.')) return
    setUndoingId(id)
    try {
      const res = await fetch(`/api/admin/google-sheets/sync-log/${id}/undo`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to undo this sync.')
        return
      }
      await loadHistory()
    } finally {
      setUndoingId(null)
    }
  }

  const sheetFields: { key: keyof ConfigState; label: string }[] = [
    { key: 'trainingSheetName', label: 'Training Cost tab name' },
    { key: 'feedbackSheetName', label: 'Feedback tab name' },
    { key: 'subscriptionSheetName', label: 'Subscriptions tab name' },
    { key: 'kssSheetName', label: 'KSS tab name' },
  ]

  const totalNewRows = preview?.sheets.reduce((s, sh) => s + sh.newRows, 0) ?? 0

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

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Comprehensive Staff List tab name <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              value={state.comprehensiveStaffListSheetName}
              onChange={(e) => setState({ ...state, comprehensiveStaffListSheetName: e.target.value })}
              placeholder="MERISTEM COMPREHENSIVE STAFF LIST"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Not part of Sync Now/Preview — read live, on demand, as a supplement to the uploaded Staff Roster wherever a Staff ID, email,
              name, line manager, or Business Unit is missing there (e.g. resolving attendees for Survey Automation).
            </p>
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
          {state.autoSyncEnabled && state.syncFrequencyMinutes < 1440 && (
            <p className="text-xs text-amber-600 -mt-2">
              Vercel&apos;s free (Hobby) plan only runs scheduled jobs once per day, regardless of this setting —
              syncs will happen at most daily unless the plan is upgraded to Pro. Use &quot;Preview Sync&quot; for anything more frequent.
            </p>
          )}

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
              onClick={previewSync}
              disabled={previewing || !state.spreadsheetUrl.trim()}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Preview Sync
            </button>
          </div>

          {preview && (
            <div className="rounded-lg border border-navy-200 bg-navy-50/40 p-4 space-y-3">
              {preview.connectionError ? (
                <p className="text-xs text-red-700">{preview.connectionError}</p>
              ) : (
                <>
                  <p className="text-xs font-semibold text-navy-700">
                    Preview — {totalNewRows} new record{totalNewRows === 1 ? '' : 's'} would be imported
                    {preview.spreadsheetTitle ? ` from "${preview.spreadsheetTitle}"` : ''}
                  </p>
                  <div className="space-y-2.5">
                    {preview.sheets.map((s) => (
                      <div key={s.type} className="bg-white rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700">{s.label} <span className="text-slate-400 font-normal">({s.sheetName})</span></p>
                          {s.error ? (
                            <span className="text-xs text-red-600">Error</span>
                          ) : (
                            <span className="text-xs text-slate-500">
                              <span className="text-emerald-700 font-medium">{s.newRows} new</span>
                              {s.alreadyImported > 0 && <span> · {s.alreadyImported} already imported</span>}
                            </span>
                          )}
                        </div>
                        {s.error ? (
                          <p className="text-xs text-red-600 mt-1">{s.error}</p>
                        ) : s.sample.length > 0 ? (
                          <div className="overflow-x-auto mt-2">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="text-slate-400">
                                  {Object.keys(s.sample[0]).map((k) => (
                                    <th key={k} className="text-left font-medium pr-3 pb-1">{k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {s.sample.map((row, i) => (
                                  <tr key={i} className="text-slate-600 border-t border-slate-100">
                                    {Object.values(row).map((v, j) => (
                                      <td key={j} className="pr-3 py-1 whitespace-nowrap">{v}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {s.newRows > s.sample.length && (
                              <p className="text-slate-400 mt-1">+ {s.newRows - s.sample.length} more</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 mt-1">Nothing new to import.</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={confirmImport}
                      disabled={syncing || totalNewRows === 0}
                      className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
                    >
                      {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirm Import
                    </button>
                    <button
                      onClick={() => setPreview(null)}
                      disabled={syncing}
                      className="text-xs font-medium text-slate-500 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

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

          {/* Sync history */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs font-semibold text-slate-700">Sync History</p>
              <span className="text-xs text-slate-400">(last 5)</span>
            </div>
            {loadingHistory ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-400">No syncs yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
                      h.undone ? 'border-slate-100 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-slate-700">
                        <span className="font-medium">{new Date(h.syncedAt).toLocaleString()}</span>{' '}
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${h.trigger === 'manual' ? 'bg-navy-100 text-navy-700' : 'bg-purple-100 text-purple-700'}`}>
                          {h.trigger === 'manual' ? 'Manual' : 'Scheduled'}
                        </span>
                        {h.undone && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-600">Undone</span>}
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        {Object.values(h.imported).some((v) => v > 0)
                          ? Object.entries(h.imported).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ')
                          : 'Nothing new imported'}
                        {!h.success && ' · had errors'}
                      </p>
                    </div>
                    {!h.undone && Object.values(h.imported).some((v) => v > 0) && (
                      <button
                        onClick={() => undoSync(h.id)}
                        disabled={undoingId === h.id}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700 shrink-0 disabled:opacity-50"
                      >
                        {undoingId === h.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                        Undo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
