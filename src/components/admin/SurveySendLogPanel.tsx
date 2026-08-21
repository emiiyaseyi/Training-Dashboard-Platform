'use client'

import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { DataTable } from '@/components/ui/DataTable'

interface SendLogEntry {
  id: string
  trainingName: string
  stage: string
  staffName: string
  recipient: string
  isReminder: boolean
  success: boolean
  errorMessage: string | null
  sentAt: string
}

const STAGE_LABELS: Record<string, string> = { pre: 'Pre-Training', post1: 'Post-1', post2: 'Post-2' }

export function SurveySendLogPanel() {
  const [log, setLog] = useState<SendLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/survey-send-log?limit=100')
      .then((r) => r.json())
      .then((data) => setLog(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <SectionCard
      icon={History}
      title="Survey Send Log"
      description="A durable record of every survey email attempt — original sends and reminders — even after an attendee's status is overwritten by a later send."
    >
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <DataTable
          columns={[
            { key: 'sentAt', header: 'Sent', render: (r) => new Date(r.sentAt as string).toLocaleString() },
            { key: 'trainingName', header: 'Training' },
            { key: 'stage', header: 'Stage', render: (r) => STAGE_LABELS[r.stage as string] || (r.stage as string) },
            { key: 'staffName', header: 'Attendee' },
            { key: 'recipient', header: 'Sent To' },
            { key: 'isReminder', header: 'Type', render: (r) => (r.isReminder ? 'Reminder' : 'Original') },
            {
              key: 'success', header: 'Status', align: 'center',
              render: (r) => (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {r.success ? 'Sent' : 'Failed'}
                </span>
              ),
            },
          ]}
          data={log as unknown as Record<string, unknown>[]}
          emptyMessage="No survey emails have been sent yet."
        />
      )}
    </SectionCard>
  )
}
