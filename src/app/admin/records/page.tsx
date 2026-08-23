'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { TrainingRecordsTab } from '@/components/admin/records/TrainingRecordsTab'
import { KSSRecordsTab } from '@/components/admin/records/KSSRecordsTab'
import { SubscriptionRecordsTab } from '@/components/admin/records/SubscriptionRecordsTab'

type Tab = 'training' | 'kss' | 'subscriptions'

const TABS: { key: Tab; label: string }[] = [
  { key: 'training', label: 'Trainings' },
  { key: 'kss', label: 'KSS' },
  { key: 'subscriptions', label: 'Subscriptions' },
]

export default function ManageRecordsPage() {
  const [tab, setTab] = useState<Tab>('training')

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Manage Records"
        subtitle="View, edit, and delete every training, KSS, and subscription record already in the system"
      />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-navy-600 text-navy-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'training' && <TrainingRecordsTab />}
        {tab === 'kss' && <KSSRecordsTab />}
        {tab === 'subscriptions' && <SubscriptionRecordsTab />}
      </div>
    </div>
  )
}
