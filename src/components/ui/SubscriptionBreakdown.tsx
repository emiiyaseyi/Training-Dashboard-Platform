'use client'

import { SectionExport } from './SectionExport'

interface OrgRow {
  org: string
  count: number
  totalAmount: number
}

interface Props {
  orgs: OrgRow[]
  title?: string
}

type Category = 'ACCA' | 'ACA / ICAN' | 'CFA' | 'CIS' | 'NBA' | 'CIPM' | 'PMI' | 'Others'

const CATEGORY_ORDER: Category[] = ['ACCA', 'ACA / ICAN', 'CFA', 'CIS', 'NBA', 'CIPM', 'PMI', 'Others']

const CATEGORY_COLORS: Record<Category, string> = {
  'ACCA':     'bg-blue-500',
  'ACA / ICAN': 'bg-purple-500',
  'CFA':      'bg-amber-500',
  'CIS':      'bg-cyan-500',
  'NBA':      'bg-red-500',
  'CIPM':     'bg-green-500',
  'PMI':      'bg-orange-500',
  'Others':   'bg-slate-400',
}

function classify(org: string): Category {
  const u = org.toUpperCase()
  if (u.includes('ACCA')) return 'ACCA'
  if (u.includes('ICAN') || (u.includes('ACA') && !u.includes('ACCA'))) return 'ACA / ICAN'
  if (u.includes('CFA')) return 'CFA'
  if (u.includes('CIS') || u.includes('STOCKBROKERS')) return 'CIS'
  if (u.includes('NBA') || u.includes('NIGERIAN BAR')) return 'NBA'
  if (u.includes('CIPM')) return 'CIPM'
  if (u.includes('PMI') || u.includes('PROJECT MANAGEMENT')) return 'PMI'
  return 'Others'
}

function fmtAmt(v: number): string {
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `₦${(v / 1_000).toFixed(1)}K`
  return `₦${v.toLocaleString()}`
}

export function SubscriptionBreakdown({ orgs, title = 'Subscription Breakdown' }: Props) {
  if (!orgs || orgs.length === 0) return null

  // Aggregate by category
  const totals: Record<Category, { members: number; amount: number }> = {
    'ACCA': { members: 0, amount: 0 },
    'ACA / ICAN': { members: 0, amount: 0 },
    'CFA': { members: 0, amount: 0 },
    'CIS': { members: 0, amount: 0 },
    'NBA': { members: 0, amount: 0 },
    'CIPM': { members: 0, amount: 0 },
    'PMI': { members: 0, amount: 0 },
    'Others': { members: 0, amount: 0 },
  }

  for (const o of orgs) {
    const cat = classify(o.org)
    totals[cat].members += o.count
    totals[cat].amount += o.totalAmount
  }

  const grandTotal = Object.values(totals).reduce((s, r) => s + r.amount, 0)
  const rows = CATEGORY_ORDER.filter((c) => totals[c].amount > 0 || totals[c].members > 0)
  const maxPct = rows.length > 0 ? Math.max(...rows.map((c) => grandTotal > 0 ? (totals[c].amount / grandTotal) * 100 : 0)) : 0

  const exportRows = rows.map((c) => ({
    Category: c,
    Members: totals[c].members,
    'Amount (₦)': totals[c].amount,
    '% of Total': grandTotal > 0 ? `${((totals[c].amount / grandTotal) * 100).toFixed(1)}%` : '—',
  }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <SectionExport rows={exportRows} filename="subscription_breakdown" label="Export" />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Category</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Members</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Amount</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 w-40">% of Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((cat) => {
              const pct = grandTotal > 0 ? (totals[cat].amount / grandTotal) * 100 : 0
              const barWidth = maxPct > 0 ? (pct / maxPct) * 100 : 0
              return (
                <tr key={cat} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_COLORS[cat]}`} />
                      <span className="font-medium text-slate-700">{cat}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {totals[cat].members.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-800">
                    {fmtAmt(totals[cat].amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${CATEGORY_COLORS[cat]}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500 w-10 text-right shrink-0">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">Total</td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 tabular-nums">
                  {rows.reduce((s, c) => s + totals[c].members, 0).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-800 tabular-nums">
                  {fmtAmt(grandTotal)}
                </td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 pr-6">100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
