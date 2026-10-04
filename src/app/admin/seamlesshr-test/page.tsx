'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, PlugZap, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

interface TestResult {
  configured: boolean
  requestUrl?: string
  requestHeaders?: string[]
  httpStatus?: number
  httpStatusText?: string
  durationMs?: number
  responseBody?: unknown
  error?: string
}

// Exploratory, super-admin-only diagnostic page for the SeamlessHR HRMS sandbox integration —
// not a real feature yet. Lets an admin trigger the same request this session used to validate
// the sandbox credentials, and see the exact response SeamlessHR sends back, so it can be
// screenshotted for SeamlessHR's own support team instead of re-typed into an email.
export default function SeamlessHRTestPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [ranAt, setRanAt] = useState<string | null>(null)

  const runTest = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/seamlesshr-sandbox-test')
      const data = await res.json()
      setResult(data)
      setRanAt(new Date().toLocaleString())
    } catch {
      setResult({ configured: true, error: 'Request to this page\'s own API route failed.' })
    } finally {
      setLoading(false)
    }
  }

  const isSuccess = result?.httpStatus != null && result.httpStatus >= 200 && result.httpStatus < 300

  return (
    <div className="flex flex-col">
      <PageHeader
        title="SeamlessHR Sandbox Test"
        subtitle="Exploratory only — checks whether the sandbox HRMS API credentials work. Not wired into any live feature."
        actions={
          <Link href="/admin" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Admin Settings
          </Link>
        }
      />

      <div className="p-4 sm:p-8 space-y-5 max-w-3xl">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <PlugZap className="w-4.5 h-4.5 text-navy-600" />
            <p className="text-sm font-semibold text-slate-800">What this does</p>
          </div>
          <p className="text-sm text-slate-600">
            Calls <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">GET /v1/employees</code> on SeamlessHR&apos;s
            sandbox (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">api-sandbox.seamlesshr.app</code>) using the
            credentials in this server&apos;s <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">.env.local</code>, and
            shows exactly what comes back — success or error — so it can be screenshotted directly.
          </p>
          <button
            type="button"
            onClick={runTest}
            disabled={loading}
            className="flex items-center gap-2 bg-navy-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:bg-navy-800 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            {loading ? 'Testing…' : 'Run Test'}
          </button>
        </div>

        {result && !result.configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Not configured</p>
              <p className="text-sm text-amber-700 mt-1">{result.error}</p>
            </div>
          </div>
        )}

        {result && result.configured && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className={`flex items-center gap-3 px-5 py-4 border-b ${isSuccess ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
              {isSuccess ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
              )}
              <div>
                <p className={`text-base font-bold ${isSuccess ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {result.httpStatus != null ? `HTTP ${result.httpStatus} ${result.httpStatusText || ''}` : 'Request failed'}
                </p>
                {ranAt && <p className="text-xs text-slate-500 mt-0.5">Tested {ranAt}{result.durationMs != null ? ` · ${result.durationMs}ms` : ''}</p>}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {result.requestUrl && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Request</p>
                  <p className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
                    GET {result.requestUrl}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Headers sent: {result.requestHeaders?.join(', ')}
                  </p>
                </div>
              )}

              {result.error && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Error</p>
                  <p className="font-mono text-xs bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-rose-700">
                    {result.error}
                  </p>
                </div>
              )}

              {result.responseBody != null && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Response body</p>
                  <pre className="font-mono text-xs bg-slate-900 text-slate-100 rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {typeof result.responseBody === 'string' ? result.responseBody : JSON.stringify(result.responseBody, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
