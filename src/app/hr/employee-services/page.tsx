'use client'

import { Users, UserPlus, UserMinus, Clock, Wallet, Headphones } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'

// The first 6 KPIs and the engagement initiatives below are real, from HR REPORT — 1ST QPR
// 2026 — everything else on this page (employment type split, BU breakdown, roster, absenteeism,
// HR service resolution) has no data source yet and is illustrative until Employee Services
// confirms one.
const KPIS = [
  { label: 'Total Headcount', value: '329', sub: 'M 161 · F 168', icon: Users, tag: 'HR Report' },
  { label: 'Attrition Rate (Q1)', value: '4.0%', sub: 'Industry avg. 5.0%', icon: UserMinus, tag: 'HR Report' },
  { label: 'New Joiners (Q1)', value: '18', sub: '100% retention so far', icon: UserPlus, tag: 'HR Report' },
  { label: 'Avg. Time to Hire', value: '5 wks', sub: 'From requisition to resumption', icon: Clock, tag: 'HR Report' },
  { label: 'Revenue / Employee', value: '₦24.15M', sub: '₦24,151,772.04, Q1 2026', icon: Wallet, tag: 'HR Report' },
  { label: 'HR Service Resolution', value: '88%', sub: 'Requests resolved within SLA', icon: Headphones, tag: 'placeholder' },
]

const TAG_STYLES: Record<string, string> = {
  'HR Report': 'text-meristem-700 bg-meristem-50',
  placeholder: 'text-rose-600 bg-rose-50',
}

const ENGAGEMENT_INITIATIVES = [
  { title: 'International Women’s Day', detail: 'Complimentary professional headshots and self-care packages for female employees group-wide.' },
  { title: 'Employee Appreciation Day', detail: 'Personalised appreciation letters and a sponsored lunch across the group.' },
  { title: 'Valentine Celebration', detail: 'Rose flowers for female staff and curated care packages for male staff, group-wide.' },
]

const EMPLOYMENT_TYPE = { labels: ['Full-time', 'Part-time', 'Contractor'], values: [289, 24, 16] }

const HEADCOUNT_BY_BU = {
  labels: ['MSL', 'MWML', 'MSBL', 'MRPSL', 'MCL', 'MFL', 'MTL', 'NESI', 'MFO'],
  values: [96, 58, 47, 33, 29, 24, 18, 14, 10],
}

const ROSTER = [
  { name: 'Alice Johnson', bu: 'MSL', role: 'Senior Accountant', contract: 'Full-time', tenure: '4.2 yrs' },
  { name: 'Bob Smith', bu: 'MWML', role: 'Investment Advisor', contract: 'Full-time', tenure: '1.8 yrs' },
  { name: 'Carol Williams', bu: 'MSBL', role: 'Client Relations Manager', contract: 'Full-time', tenure: '6.1 yrs' },
  { name: 'David Brown', bu: 'MRPSL', role: 'Registrar Officer', contract: 'Contractor', tenure: '0.9 yrs' },
  { name: 'Eva Green', bu: 'MCL', role: 'Trust Officer', contract: 'Full-time', tenure: '2.4 yrs' },
  { name: 'Frank Miller', bu: 'MFL', role: 'Finance Analyst', contract: 'Part-time', tenure: '3.0 yrs' },
]

const BU_COLORS: Record<string, string> = {
  MSL: 'bg-blue-50 text-blue-700', MWML: 'bg-violet-50 text-violet-700', MSBL: 'bg-rose-50 text-rose-700',
  MRPSL: 'bg-amber-50 text-amber-700', MCL: 'bg-emerald-50 text-emerald-700', MFL: 'bg-teal-50 text-teal-700',
}

export default function EmployeeServicesPage() {
  return (
    <div>
      <UnitPageHeader title="Employee Services" description="Headcount, attrition, engagement & workforce composition" icon={Users} />

      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {KPIS.map((k) => (
            <div key={k.label} className="bg-white border border-meristem-100 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-full bg-meristem-100 flex items-center justify-center">
                  <k.icon className="w-4.5 h-4.5 text-meristem-700" />
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${TAG_STYLES[k.tag]}`}>{k.tag}</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{k.value}</p>
              <p className="text-xs font-medium text-slate-600 mt-1">{k.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-3">Employment Type</p>
            <PieChart labels={EMPLOYMENT_TYPE.labels} values={EMPLOYMENT_TYPE.values} donut height={240} />
          </div>
          <div className="bg-white border border-meristem-100 rounded-2xl p-5 lg:col-span-2">
            <p className="text-sm font-bold text-slate-800 mb-3">Headcount by Business Unit</p>
            <BarChart labels={HEADCOUNT_BY_BU.labels} values={HEADCOUNT_BY_BU.values} color="#2F6B2B" showLabels height={240} />
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-1">Employee Engagement Initiatives — Q1 2026</p>
          <p className="text-xs text-slate-400 mb-4">From HR REPORT — 1ST QPR 2026</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ENGAGEMENT_INITIATIVES.map((e) => (
              <div key={e.title} className="bg-meristem-50/60 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-800">{e.title}</p>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{e.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-meristem-50">
            <p className="text-sm font-bold text-slate-800">Sample Roster</p>
            <p className="text-xs text-slate-400 mt-0.5">Illustrative rows — will be replaced by the real Employee Services data source.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                  <th className="px-5 py-2.5 font-medium">Employee</th>
                  <th className="px-5 py-2.5 font-medium">Business Unit</th>
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  <th className="px-5 py-2.5 font-medium">Contract</th>
                  <th className="px-5 py-2.5 font-medium text-right">Tenure</th>
                </tr>
              </thead>
              <tbody>
                {ROSTER.map((r) => (
                  <tr key={r.name} className="border-b border-meristem-50 last:border-0">
                    <td className="px-5 py-3 text-slate-800 font-medium">{r.name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BU_COLORS[r.bu] || 'bg-slate-50 text-slate-600'}`}>{r.bu}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.role}</td>
                    <td className="px-5 py-3 text-slate-600">{r.contract}</td>
                    <td className="px-5 py-3 text-slate-600 text-right tabular-nums">{r.tenure}</td>
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
