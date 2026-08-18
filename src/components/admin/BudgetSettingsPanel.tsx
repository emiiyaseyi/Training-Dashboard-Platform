'use client'

import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'

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
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start gap-3">
        <Wallet className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">Budget Calculation</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Subscription Spend (professional memberships) is a separate cost category from the training budget by default.
            Turn this on if it should also count against each Business Unit&apos;s budget and over-budget status.
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={loading || saving}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${countSubs ? 'bg-blue-600' : 'bg-slate-200'} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${countSubs ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-3 ml-8">
        {loading ? 'Loading…' : countSubs ? 'Subscription Spend counts toward budget.' : 'Subscription Spend does not count toward budget (default).'}
      </p>
    </div>
  )
}
