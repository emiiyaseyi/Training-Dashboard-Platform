'use client'

import { useEffect, useState } from 'react'
import { FileSpreadsheet, Trash2, RefreshCw } from 'lucide-react'
import { FileUpload } from '@/components/upload/FileUpload'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable } from '@/components/ui/DataTable'

interface UploadBatch {
  id: string
  type: string
  filename: string
  recordCount: number
  period: string | null
  createdAt: string
}

export default function UploadPage() {
  const [history, setHistory] = useState<UploadBatch[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/upload/history')
      const json = await res.json()
      if (!Array.isArray(json)) {
        console.error('[upload/history] unexpected response', json)
        setHistory([])
      } else {
        setHistory(json)
      }
    } catch (err) {
      console.error('[upload/history] fetch failed', err)
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => { loadHistory() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this upload batch? All associated records will be removed.')) return
    setDeleteId(id)
    try {
      await fetch(`/api/upload/history?id=${id}`, { method: 'DELETE' })
      await loadHistory()
    } finally {
      setDeleteId(null)
    }
  }

  const typeLabel: Record<string, string> = {
    training: 'Training Cost',
    feedback: 'Training Feedback',
    subscription: 'Subscriptions',
  }

  const typeBadge: Record<string, string> = {
    training: 'bg-blue-100 text-blue-700',
    feedback: 'bg-purple-100 text-purple-700',
    subscription: 'bg-green-100 text-green-700',
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Upload & Data Management"
        subtitle="Import Excel files to populate the dashboard"
      />

      <div className="p-8 space-y-8">
        {/* Guide */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-3">How to use this page</h2>
          <ol className="space-y-2 text-sm text-blue-800">
            <li><span className="font-medium">1.</span> Prepare your Excel files with the correct column headers (see below).</li>
            <li><span className="font-medium">2.</span> Upload each file using the appropriate section. Column headers are auto-detected.</li>
            <li><span className="font-medium">3.</span> Set budgets and staff counts in <span className="font-medium">Admin Settings</span> for full analytics.</li>
            <li><span className="font-medium">4.</span> Navigate to the dashboards to view your data.</li>
          </ol>
        </div>

        {/* Upload cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FileUpload
            endpoint="/api/upload/training"
            label="Training Cost Data"
            description="Headers: S/N, Name, Staff ID, Training, Business Units, Month, Cost, Learning Hours"
            onSuccess={loadHistory}
          />
          <FileUpload
            endpoint="/api/upload/feedback"
            label="Training Feedback Data"
            description="Headers: Business Unit, Training Title, Role, Month, Application response, Impact alignment, Confidence rating, Role Relevance, Expectations Met, Vendor Rating, Vendor Name, Qualitative responses"
            onSuccess={loadHistory}
          />
          <FileUpload
            endpoint="/api/upload/subscriptions"
            label="Professional Subscriptions"
            description="Headers: Month, Staff ID, Name, Business Unit, Membership Organization, Amount"
            onSuccess={loadHistory}
          />
          <FileUpload
            endpoint="/api/upload/kss"
            label="KSS — Knowledge Sharing Sessions"
            description="Headers: Staff ID, Name, Business Unit, In-Meeting Duration, Month — tracks internal learning hours"
            onSuccess={loadHistory}
          />
        </div>

        {/* Expected formats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            {
              title: 'Training Cost — Expected Columns',
              columns: ['S/N', 'Name', 'Staff ID', 'Training', 'Business Units', 'Month', 'Cost', 'Learning Hours (optional)'],
              color: 'blue',
            },
            {
              title: 'Training Feedback — Expected Columns',
              columns: ['Business Unit', 'Training Title', 'Role', 'Month', 'Application response', 'Impact alignment', 'Confidence rating (0–5)', 'Role Relevance (1–5)', 'Expectations Met (1–5)', 'Vendor Rating (0–5)', 'Vendor Name (optional)', 'Qualitative responses'],
              color: 'purple',
            },
            {
              title: 'Subscriptions — Expected Columns',
              columns: ['Month', 'Staff ID', 'Name', 'Business Unit', 'Membership Organization', 'Amount'],
              color: 'green',
            },
            {
              title: 'KSS — Expected Columns',
              columns: ['Staff ID', 'Name', 'Business Unit', 'In-Meeting Duration', 'Month'],
              color: 'blue',
            },
          ].map(({ title, columns, color }) => (
            <div key={title} className={`rounded-xl border border-${color}-100 bg-${color}-50 p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <FileSpreadsheet className={`w-4 h-4 text-${color}-500`} />
                <p className={`text-xs font-semibold text-${color}-800`}>{title}</p>
              </div>
              <ul className="space-y-1">
                {columns.map((c) => (
                  <li key={c} className={`text-xs text-${color}-700 flex items-center gap-1.5`}>
                    <span className={`w-1 h-1 rounded-full bg-${color}-400`} />
                    {c}
                  </li>
                ))}
              </ul>
              <p className={`mt-3 text-xs text-${color}-500`}>Column names are flexible — the system auto-detects variations.</p>
            </div>
          ))}
        </div>

        {/* Upload history */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">Upload History</h2>
            <button onClick={loadHistory} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {loadingHistory ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : history.length === 0 ? (
            <AlertBadge variant="info" message="No uploads yet. Use the upload cards above to import your first dataset." />
          ) : (
            <DataTable
              columns={[
                {
                  key: 'type',
                  header: 'Type',
                  render: (r) => (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeBadge[r.type as string] ?? 'bg-slate-100 text-slate-600'}`}>
                      {typeLabel[r.type as string] ?? r.type as string}
                    </span>
                  ),
                },
                { key: 'filename', header: 'Filename' },
                { key: 'recordCount', header: 'Records', align: 'right' },
                { key: 'period', header: 'Period', render: (r) => (r.period as string) || '—' },
                {
                  key: 'createdAt',
                  header: 'Uploaded',
                  render: (r) => new Date(r.createdAt as string).toLocaleString(),
                },
                {
                  key: 'id',
                  header: '',
                  align: 'center',
                  render: (r) => (
                    <button
                      onClick={() => handleDelete(r.id as string)}
                      disabled={deleteId === r.id}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                      title="Delete batch"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ),
                },
              ]}
              data={history as unknown as Record<string, unknown>[]}
            />
          )}
        </div>
      </div>
    </div>
  )
}
