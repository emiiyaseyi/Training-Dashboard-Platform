'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, PlugZap, Loader2, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

interface ProbeResult {
  id: string
  section: string
  label: string
  coverageNote: string
  requestUrl?: string
  httpStatus?: number
  httpStatusText?: string
  durationMs?: number
  responseBody?: unknown
  error?: string
}

interface TestResponse {
  configured: boolean
  error?: string
  results?: ProbeResult[]
}

// Exploratory, super-admin-only diagnostic page for the SeamlessHR HRMS sandbox integration —
// not a real feature yet. Tests one representative endpoint per HR section we asked SeamlessHR
// about (Employee Services, Talent Acquisition, Performance Management), and shows the exact
// response for each, plus a coverage note (from reading SeamlessHR's own API docs end to end)
// on what that section's requested data actually has — or doesn't have — a matching endpoint.
export default function SeamlessHRTestPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TestResponse | null>(null)
  const [ranAt, setRanAt] = useState<string | null>(null)

  const runTest = async () => {
    setLoading(true)
    setData(null)
    try {
      const res = await fetch('/api/admin/seamlesshr-sandbox-test')
      const json = await res.json()
      setData(json)
      setRanAt(new Date().toLocaleString())
    } catch {
      setData({ configured: true, error: "Request to this page's own API route failed." })
    } finally {
      setLoading(false)
    }
  }

  const grouped = (data?.results || []).reduce<Record<string, ProbeResult[]>>((acc, r) => {
    acc[r.section] = acc[r.section] || []
    acc[r.section].push(r)
    return acc
  }, {})

  return (
    <div className="flex flex-col">
      <PageHeader
        title="SeamlessHR Sandbox Test"
        subtitle="Exploratory only — checks the sandbox HRMS API against what we asked for in Employee Services, Talent Acquisition, and Performance Management. Not wired into any live feature."
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
            Calls 5 endpoints on SeamlessHR&apos;s sandbox (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">api-sandbox.seamlesshr.app</code>) —
            a company-discovery diagnostic, plus one per HR section we asked SeamlessHR about — using the credentials in this server&apos;s environment, and shows
            exactly what comes back for each, plus what that endpoint does and doesn&apos;t cover based on their published docs.
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

        {data && !data.configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Not configured</p>
              <p className="text-sm text-amber-700 mt-1">{data.error}</p>
            </div>
          </div>
        )}

        {data?.configured && data.error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{data.error}</p>
          </div>
        )}

        {ranAt && data?.results && <p className="text-xs text-slate-400">Tested {ranAt}</p>}

        {Object.entries(grouped).map(([section, results]) => (
          <div key={section} className="space-y-3">
            <h2 className="text-sm font-bold text-slate-800">{section}</h2>
            {results.map((r) => {
              const isSuccess = r.httpStatus != null && r.httpStatus >= 200 && r.httpStatus < 300
              return (
                <div key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`flex items-center gap-3 px-5 py-3 border-b ${isSuccess ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    {isSuccess ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <p className={`text-sm font-bold ${isSuccess ? 'text-emerald-800' : 'text-rose-800'}`}>
                        {r.label} — {r.httpStatus != null ? `HTTP ${r.httpStatus} ${r.httpStatusText || ''}` : 'Request failed'}
                      </p>
                      {r.durationMs != null && <p className="text-xs text-slate-500">{r.durationMs}ms</p>}
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-600">{r.coverageNote}</p>
                    </div>

                    {r.requestUrl && (
                      <p className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
                        GET {r.requestUrl}
                      </p>
                    )}

                    {r.error && (
                      <p className="font-mono text-xs bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-rose-700">
                        {r.error}
                      </p>
                    )}

                    {r.responseBody != null && (
                      <pre className="font-mono text-xs bg-slate-900 text-slate-100 rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all">
                        {typeof r.responseBody === 'string' ? r.responseBody : JSON.stringify(r.responseBody, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
