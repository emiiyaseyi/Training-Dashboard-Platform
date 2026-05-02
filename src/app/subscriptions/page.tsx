'use client'

import { useEffect, useState, useCallback } from 'react'
import { BadgeCheck, Users, Building2, RefreshCw, TrendingUp } from 'lucide-react'
import { NairaSign } from '@/components/ui/NairaSign'
import { KPICard } from '@/components/ui/KPICard'
import { DataTable } from '@/components/ui/DataTable'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterBar } from '@/components/ui/FilterBar'
import { PDFExportButton } from '@/components/ui/PDFExportButton'
import { ParticipationCard } from '@/components/ui/ParticipationCard'
import { SectionExport } from '@/components/ui/SectionExport'
import { LearningIntelligenceLayer } from '@/components/ui/LearningIntelligenceLayer'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import type { GroupAnalytics } from '@/lib/analytics'
import { type PeriodFilter, filterToQuery } from '@/lib/filter-types'

type DashData = GroupAnalytics & { narrative: string[] }

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}
function pct(n: number) { return `${n.toFixed(1)}%` }

export default function SubscriptionsDashboard() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PeriodFilter>({ mode: 'all' })

  const load = useCallback(async (f: PeriodFilter) => {
    setLoading(true)
    try { setData(await (await fetch(`/api/analytics/group${filterToQuery(f)}`)).json()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!data) return null

  const isEmpty = data.totalSubscriptionCost === 0
  const avgCostPerStaff = data.uniqueSubscriptionStaff > 0 ? data.totalSubscriptionCost / data.uniqueSubscriptionStaff : 0
  const totalSubscriptions = data.topMembershipOrgs.reduce((s, o) => s + o.count, 0)
  const topOrgShare = data.totalSubscriptionCost > 0 && data.topMembershipOrgs.length > 0
    ? (data.topMembershipOrgs[0].totalAmount / data.totalSubscriptionCost) * 100 : 0
  const buSubData = data.businessUnits.filter((b) => b.subscriptionCost > 0)
  const highSubRatioBUs = data.businessUnits.filter((b) => b.subscriptionRatio > 50)
  const highTrainRatioBUs = data.businessUnits.filter((b) => b.subscriptionRatio < 20 && b.totalInvestment > 0)

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Professional Subscriptions"
        subtitle="Professional membership and accreditation investment tracking"
        actions={
          <div className="flex items-center gap-2">
            <FilterBar availableYears={data.availableYears} value={filter} onChange={setFilter} />
            <PDFExportButton reportTitle="Professional Subscriptions — Learning Intelligence Dashboard" />
            <button onClick={() => load(filter)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-8">
        {isEmpty && <AlertBadge variant="info" message="No subscription data uploaded yet." />}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Subscription Spend" value={fmt(data.totalSubscriptionCost)} subtitle="All professional memberships" icon={NairaSign} color="green" />
          <KPICard title="Staff with Subscriptions" value={data.uniqueSubscriptionStaff.toLocaleString()} subtitle="Unique members" icon={Users} color="blue" />
          <KPICard title="Total Subscriptions" value={totalSubscriptions.toLocaleString()} subtitle="Individual memberships" icon={BadgeCheck} color="purple" />
          <KPICard title="Avg Cost per Member" value={fmt(avgCostPerStaff)} subtitle="Per subscribed staff" icon={TrendingUp} color="amber" />
        </div>

        {topOrgShare > 35 && data.topMembershipOrgs.length > 0 && (
          <AlertBadge variant="warning" message={`${data.topMembershipOrgs[0].org} accounts for ${pct(topOrgShare)} of total subscription spend — consider diversifying.`} />
        )}

        {/* Learning Intelligence & Risk Layer — immediately after KPI summary */}
        {!isEmpty && <LearningIntelligenceLayer li={data.learningIntelligence} />}

        {/* Participation */}
        {!isEmpty && (
          <ParticipationCard title="Subscription Participation" participation={data.subscriptionParticipation} totalStaff={data.totalStaffCount} />
        )}

        {/* Profile insights */}
        {!isEmpty && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {highSubRatioBUs.length > 0 && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-semibold text-blue-700 mb-1">Accreditation-focused</p>
                <p className="text-xs text-blue-600">{highSubRatioBUs.map((b) => b.name).join(', ')} — subscription spend exceeds 50% of total learning investment.</p>
              </div>
            )}
            {highTrainRatioBUs.length > 0 && (
              <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                <p className="text-xs font-semibold text-purple-700 mb-1">Skill-acquisition focused</p>
                <p className="text-xs text-purple-600">{highTrainRatioBUs.map((b) => b.name).join(', ')} — training dominates learning spend.</p>
              </div>
            )}
            {data.totalLearningInvestment > 0 && (
              <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                <p className="text-xs font-semibold text-green-700 mb-1">Subscription as % of total</p>
                <p className="text-2xl font-bold text-green-700">{pct(data.subscriptionSharePct)}</p>
                <p className="text-xs text-green-600 mt-1">of total learning investment</p>
              </div>
            )}
          </div>
        )}

        {/* Charts */}
        {!isEmpty && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-800">Spend by Business Unit</h2>
                <SectionExport rows={buSubData.map((b) => ({ 'Business Unit': b.name, 'Subscription Spend (₦)': b.subscriptionCost }))} filename="subscription_bu_spend" />
              </div>
              <BarChart labels={buSubData.map((b) => b.name)} values={buSubData.map((b) => b.subscriptionCost)} color="#22c55e" height={260} horizontal={buSubData.length > 4} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-800">Distribution by Membership Organisation</h2>
                <SectionExport rows={data.topMembershipOrgs.map((o) => ({ Organisation: o.org, Members: o.count, 'Total Spend (₦)': o.totalAmount }))} filename="membership_orgs" />
              </div>
              {data.topMembershipOrgs.length > 0
                ? <PieChart labels={data.topMembershipOrgs.map((o) => o.org)} values={data.topMembershipOrgs.map((o) => o.totalAmount)} donut height={260} />
                : <p className="text-sm text-slate-400 text-center py-8">No data</p>}
            </div>
          </div>
        )}

        {/* Tables */}
        {data.topMembershipOrgs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-800">Top Membership Organisations by Spend</span>
              <SectionExport rows={data.topMembershipOrgs.map((o) => ({ Organisation: o.org, Members: o.count, 'Total Spend (₦)': o.totalAmount, 'Avg Cost (₦)': Math.round(o.totalAmount / o.count), '% of Spend': data.totalSubscriptionCost > 0 ? pct((o.totalAmount / data.totalSubscriptionCost) * 100) : '—' }))} filename="top_membership_orgs" />
            </div>
            <DataTable
              columns={[
                { key: 'org', header: 'Organisation' },
                { key: 'count', header: 'Members', align: 'right' },
                { key: 'totalAmount', header: 'Total Spend', align: 'right', render: (r) => fmt(r.totalAmount as number) },
                { key: 'totalAmount', header: 'Avg Cost / Member', align: 'right', render: (r) => fmt((r.totalAmount as number) / (r.count as number)) },
                { key: 'totalAmount', header: '% of Spend', align: 'right', render: (r) => data.totalSubscriptionCost > 0 ? pct(((r.totalAmount as number) / data.totalSubscriptionCost) * 100) : '—' },
              ]}
              data={data.topMembershipOrgs as unknown as Record<string, unknown>[]}
            />
          </div>
        )}

        {buSubData.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-800">Business Unit Subscription Detail</span>
              <SectionExport rows={data.businessUnits.filter((b) => b.totalInvestment > 0).map((b) => ({ 'Business Unit': b.name, 'Sub Spend (₦)': b.subscriptionCost, 'Training Spend (₦)': b.trainingCost, 'Total Investment (₦)': b.totalInvestment, 'Sub Ratio %': b.subscriptionRatio.toFixed(1), 'Members': b.subscriptionStaff }))} filename="bu_subscription_detail" />
            </div>
            <DataTable
              columns={[
                { key: 'name', header: 'Business Unit' },
                { key: 'subscriptionCost', header: 'Sub Spend', align: 'right', render: (r) => fmt(r.subscriptionCost as number) },
                { key: 'trainingCost', header: 'Training Spend', align: 'right', render: (r) => fmt(r.trainingCost as number) },
                { key: 'totalInvestment', header: 'Total Investment', align: 'right', render: (r) => fmt(r.totalInvestment as number) },
                {
                  key: 'subscriptionRatio', header: 'Sub Ratio', align: 'right',
                  render: (r) => {
                    const ratio = r.subscriptionRatio as number
                    const label = ratio > 50 ? 'Accreditation-led' : ratio < 20 ? 'Training-led' : 'Balanced'
                    const cls = ratio > 50 ? 'bg-blue-100 text-blue-700' : ratio < 20 ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
                  },
                },
                { key: 'subscriptionStaff', header: 'Members', align: 'right' },
              ]}
              data={data.businessUnits.filter((b) => b.totalInvestment > 0) as unknown as Record<string, unknown>[]}
            />
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-700">What professional subscriptions tell us</p>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                High subscription investment signals professional identity and credentialing focus. High training spend signals active capability development.
                A balanced portfolio — both subscriptions and training — is characteristic of a mature learning culture.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
