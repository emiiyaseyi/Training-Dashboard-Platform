'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { GroupAnalytics } from '@/lib/analytics'

interface StaffCountIssue {
  businessUnit: string
  configuredHeadcount: number
  staffTrained: number
  subscriptionStaff: number
}

// Flags Business Units where more distinct staff appear in training/subscription records than
// the configured headcount allows — usually means the headcount in Admin is stale, or staff are
// being uploaded against the wrong Business Unit.
export function DataQualityIssues() {
  const [issues, setIssues] = useState<StaffCountIssue[] | null>(null)

  useEffect(() => {
    fetch('/api/analytics/group')
      .then((r) => r.json())
      .then((data: GroupAnalytics) => {
        const flagged = data.businessUnits
          .filter((b) => b.totalStaff > 0 && (b.staffTrained > b.totalStaff || b.subscriptionStaff > b.totalStaff))
          .map((b) => ({
            businessUnit: b.name,
            configuredHeadcount: b.totalStaff,
            staffTrained: b.staffTrained,
            subscriptionStaff: b.subscriptionStaff,
          }))
        setIssues(flagged)
      })
      .catch(() => setIssues([]))
  }, [])

  if (!issues || issues.length === 0) return null

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-900">
            Data Quality: {issues.length} Business Unit{issues.length !== 1 ? 's' : ''} with more staff than configured headcount
          </p>
          <p className="text-xs text-red-700 mt-1">
            More distinct staff appear in uploaded records than the configured headcount allows — this usually means the headcount in{' '}
            <Link href="/admin" className="underline font-medium inline-flex items-center gap-0.5">
              Admin Settings <ExternalLink className="w-3 h-3" />
            </Link>{' '}
            is out of date, or some staff were uploaded against the wrong Business Unit.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-red-200">
                  <th className="text-left py-1.5 pr-4 font-semibold text-red-800">Business Unit</th>
                  <th className="text-right py-1.5 pr-4 font-semibold text-red-800">Configured Headcount</th>
                  <th className="text-right py-1.5 pr-4 font-semibold text-red-800">Staff Trained</th>
                  <th className="text-right py-1.5 font-semibold text-red-800">Staff with Subscriptions</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.businessUnit} className="border-b border-red-100 last:border-0">
                    <td className="py-1.5 pr-4 text-red-900 font-medium">{issue.businessUnit}</td>
                    <td className="py-1.5 pr-4 text-right text-red-700 tabular-nums">{issue.configuredHeadcount}</td>
                    <td className={`py-1.5 pr-4 text-right tabular-nums ${issue.staffTrained > issue.configuredHeadcount ? 'font-bold text-red-700' : 'text-red-700'}`}>
                      {issue.staffTrained}
                    </td>
                    <td className={`py-1.5 text-right tabular-nums ${issue.subscriptionStaff > issue.configuredHeadcount ? 'font-bold text-red-700' : 'text-red-700'}`}>
                      {issue.subscriptionStaff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
