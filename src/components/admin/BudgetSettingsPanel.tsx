'use client'

import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

export function BudgetSettingsPanel() {
  const [countSubs, setCountSubs] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/budget-settings')
      .then((r) => r.json())
      .then((data) => setCountSubs(!!data.countSubscriptionsInBudget))
      .finally(() => setLoading(false))
  }, [])

  const toggle = async () => {
    const next = !countSubs
    setCountSubs(next)
    setSaving(true)
    try {
      await fetch('/api/admin/budget-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countSubscriptionsInBudget: next }),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      icon={Wallet}
      title="Budget Calculation"
      description="Subscription Spend (professional memberships) is a separate cost category from the training budget by default. Turn this on if it should also count against each Business Unit's budget and over-budget status."
      headerActions={
        <button
          onClick={(e) => { e.stopPropagation(); toggle() }}
          disabled={loading || saving}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${countSubs ? 'bg-blue-600' : 'bg-slate-200'} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${countSubs ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      }
    >
      <p className="text-xs text-slate-400">
        {loading ? 'Loading…' : countSubs ? 'Subscription Spend counts toward budget.' : 'Subscription Spend does not count toward budget (default).'}
      </p>
    </SectionCard>
  )
}
