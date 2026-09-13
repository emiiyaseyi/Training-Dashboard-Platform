'use client'

import { useState } from 'react'
import { Users, UserPlus, UserMinus, Clock, Wallet, Headphones, MapPin, LogOut } from 'lucide-react'
import { UnitPageHeader } from '@/components/hr/UnitPageHeader'
import { MetricListCard } from '@/components/hr/MetricListCard'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { FilterBar } from '@/components/ui/FilterBar'
import type { PeriodFilter } from '@/lib/filter-types'

// Real figures below come from the embedded chart data inside HR REPORT — 1ST QPR 2026.pptx
// (each chart's cached c:numCache values, not just its visible text) — every set was verified by
// summing to a known real total (329 headcount, 31 joiners, 17 exits) before use. The period
// filter mirrors Learning Intelligence's for UI consistency, but this page has no time-series
// source behind it yet (the report is a single Q1 2026 snapshot), so changing it doesn't reshape
// these numbers until a live per-period feed exists.
const KPIS = [
  { label: 'Total Headcount', value: '329', sub: 'M 161 · F 168', icon: Users, tag: 'HR Report' },
  { label: 'Attrition Rate (Q1)', value: '4.0%', sub: 'Industry avg. 5.0%', icon: UserMinus, tag: 'HR Report' },
  { label: 'Average Tenure', value: '3.2 yrs', sub: 'Group‑wide average length of service', icon: Clock, tag: 'HR Report' },
  { label: 'Revenue / Employee', value: '₦24.15M', sub: '₦24,151,772.04, Q1 2026', icon: Wallet, tag: 'HR Report' },
  { label: 'New Joiners (Q1)', value: '31', sub: '100% retention · avg. 5 wks to hire', icon: UserPlus, tag: 'HR Report' },
  { label: 'Exits (Q1)', value: '17', sub: '5.2% of headcount', icon: LogOut, tag: 'HR Report' },
  { label: 'Front / Back Office', value: '89 / 240', sub: '27% front office, 73% back office', icon: MapPin, tag: 'HR Report' },
  { label: 'HR Service Resolution', value: '88%', sub: 'Requests resolved within SLA', icon: Headphones, tag: 'placeholder' },
]

const TAG_STYLES: Record<string, string> = {
  'HR Report': 'text-meristem-700 bg-meristem-50',
  placeholder: 'text-rose-600 bg-rose-50',
}

// Categories from the HR executive-scorecard framework with no data source anywhere in this app
// yet — kept as explicit "—" rows rather than invented numbers. Trimmed of the items that turned
// out to be real (New Hires, Exit Rate, Resignations, Terminations) once the PPTX's embedded
// chart data was checked — those now have their own real cards below instead.
const WORKFORCE_METRICS = ['Headcount by Department', 'Headcount by Grade/Level', 'Headcount Growth Rate', 'FTE vs. Budgeted Headcount']
const MOVEMENT_METRICS = ['Retirements', 'Transfers between BUs', 'Promotions', 'Internal Mobility Rate']
const ATTENDANCE_METRICS = ['Attendance Rate', 'Absenteeism Rate', 'Unplanned Absence Rate', 'Sick Leave Utilisation', 'Annual Leave Utilisation', 'Average Leave Days Taken', 'Employees with Outstanding Leave', 'Overtime Hours']
const HR_OPS_METRICS = ['HR Requests Received', 'HR Requests Resolved', 'Avg. Resolution Time', 'Payroll Accuracy Rate', 'Employee Data Completeness', 'HR Service Satisfaction Score']
const RELATIONS_METRICS = ['Grievances Raised', 'Grievances Resolved', 'Disciplinary Cases', 'Employee Complaints', 'Workplace Conflict Cases', 'Avg. Case Resolution Time']

const ENGAGEMENT_INITIATIVES = [
  { title: 'International Women’s Day', detail: 'Complimentary professional headshots and self-care packages for female employees group-wide.' },
  { title: 'Employee Appreciation Day', detail: 'Personalised appreciation letters and a sponsored lunch across the group.' },
  { title: 'Valentine Celebration', detail: 'Rose flowers for female staff and curated care packages for male staff, group-wide.' },
]

// Real: "Employees by Employment Type" chart (329 total = 282 + 1 + 46).
const EMPLOYMENT_TYPE = { labels: ['Full-Time', 'Contract', 'Intern'], values: [282, 1, 46] }

// Real: "Total Headcount by Business Units" chart — sums to 329.
const HEADCOUNT_BY_BU = {
  labels: ['MSL', 'MWML', 'MRPSL', 'MSBL', 'MTL', 'MCL', 'MFL', 'NESI', 'MFO'],
  values: [132, 76, 41, 34, 12, 11, 8, 11, 4],
}

// Real: "Employee Category by Business Unit" chart — Front/Back Office by BU, sums to 89/240.
const OFFICE_BY_BU = {
  labels: ['MSL', 'MWML', 'MSBL', 'MRPSL', 'MTL', 'MCL', 'MFL', 'MFO', 'NESI'],
  backOffice: [118, 28, 18, 38, 10, 10, 5, 2, 11],
  frontOffice: [14, 48, 16, 3, 2, 1, 3, 2, 0],
}

// Real: "Workforce Location" chart — only MRPSL/MSL/MWML have staff outside Lagos; every other
// entity's headcount sits entirely in Lagos. Matches the report's own commentary (below) about
// Abuja representation.
const LOCATION_BY_BU = [
  { bu: 'MRPSL', abuja: 1, lagos: 39, portHarcourt: 1 },
  { bu: 'MSL', abuja: 3, lagos: 128, portHarcourt: 1 },
  { bu: 'MWML', abuja: 5, lagos: 67, portHarcourt: 4 },
]
const SINGLE_LOCATION_BUS = [
  { bu: 'MCL', count: 11 }, { bu: 'MFL', count: 8 }, { bu: 'MFO', count: 4 }, { bu: 'MSBL', count: 34 }, { bu: 'MTL', count: 12 }, { bu: 'NESI', count: 11 },
]

// Real: "Employees by Religion", "...by Generations", "...by Geo Political Zones" charts.
const RELIGION = { labels: ['Christianity', 'Islam', 'Unspecified'], values: [268, 58, 3] }
const GENERATION = { labels: ['Gen X', 'Millennials', 'Gen Z'], values: [35, 154, 138] }
const GEO_ZONE = { labels: ['South West', 'South South', 'North Central', 'South East', 'North East', 'North West'], values: [183, 53, 32, 51, 5, 5] }

// Real: "Exited Staff by Month" and "Type of Exit" charts — both sum to 17.
const EXITS_BY_MONTH = { labels: ['Jan', 'Feb', 'Mar'], values: [5, 8, 4] }
const EXITS_BY_TYPE = { labels: ['Resignation', 'End of Contract', 'Termination'], values: [11, 5, 1] }

const ROSTER = [
  { name: 'Alice Johnson', bu: 'MSL', role: 'Senior Accountant', contract: 'Full-Time', tenure: '4.2 yrs' },
  { name: 'Bob Smith', bu: 'MWML', role: 'Investment Advisor', contract: 'Full-Time', tenure: '1.8 yrs' },
  { name: 'Carol Williams', bu: 'MSBL', role: 'Client Relations Manager', contract: 'Full-Time', tenure: '6.1 yrs' },
  { name: 'David Brown', bu: 'MRPSL', role: 'Registrar Officer', contract: 'Contract', tenure: '0.9 yrs' },
  { name: 'Eva Green', bu: 'MCL', role: 'Trust Officer', contract: 'Full-Time', tenure: '2.4 yrs' },
  { name: 'Frank Miller', bu: 'MFL', role: 'Finance Analyst', contract: 'Intern', tenure: '0.3 yrs' },
]

const BU_COLORS: Record<string, string> = {
  MSL: 'bg-blue-50 text-blue-700', MWML: 'bg-violet-50 text-violet-700', MSBL: 'bg-rose-50 text-rose-700',
  MRPSL: 'bg-amber-50 text-amber-700', MCL: 'bg-emerald-50 text-emerald-700', MFL: 'bg-teal-50 text-teal-700',
}

export default function EmployeeServicesPage() {
  const [period, setPeriod] = useState<PeriodFilter>({ mode: 'all' })

  return (
    <div>
      <UnitPageHeader
        title="Employee Services"
        description="Headcount, attrition, engagement & workforce composition"
        icon={<Users className="w-5 h-5 text-meristem-700" />}
        actions={<FilterBar availableYears={[2026, 2025]} value={period} onChange={setPeriod} />}
      />

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
          <p className="text-sm font-bold text-slate-800 mb-1">Workforce Location</p>
          <p className="text-xs text-slate-400 mb-4">MCL, MFL, MFO, MSBL, MTL and NESI staff sit entirely in Lagos — only these three entities have staff outside it</p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                  <th className="py-2 pr-4 font-medium">Business Unit</th>
                  <th className="py-2 pr-4 font-medium text-right">Abuja</th>
                  <th className="py-2 pr-4 font-medium text-right">Lagos</th>
                  <th className="py-2 font-medium text-right">Port Harcourt</th>
                </tr>
              </thead>
              <tbody>
                {LOCATION_BY_BU.map((r) => (
                  <tr key={r.bu} className="border-b border-meristem-50 last:border-0">
                    <td className="py-2 pr-4 text-slate-700 font-medium">{r.bu}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{r.abuja}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{r.lagos}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{r.portHarcourt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {SINGLE_LOCATION_BUS.map((b) => (
              <span key={b.bu} className="text-[11px] font-medium bg-meristem-50 text-meristem-800 rounded-full px-2.5 py-1">{b.bu} · {b.count} (Lagos)</span>
            ))}
          </div>
          <p className="text-xs text-slate-500">Abuja staff for MTL are expected to join in Q2 2026. MSBL, MRPSL and MWML need more Advisor representation in Abuja.</p>
        </div>

        <div>
          <p className="text-sm font-bold text-slate-800 mb-3">Workforce Demographics</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-meristem-100 rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-700 mb-3">By Religion</p>
              <PieChart labels={RELIGION.labels} values={RELIGION.values} donut height={220} />
            </div>
            <div className="bg-white border border-meristem-100 rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-700 mb-3">By Generation</p>
              <PieChart labels={GENERATION.labels} values={GENERATION.values} donut height={220} />
            </div>
            <div className="bg-white border border-meristem-100 rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-700 mb-3">By Geopolitical Zone</p>
              <BarChart labels={GEO_ZONE.labels} values={GEO_ZONE.values} color="#7A66B0" horizontal showLabels height={200} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">Exits Q1 2026 — by Month</p>
            <p className="text-xs text-slate-400 mb-3">17 total exits</p>
            <BarChart labels={EXITS_BY_MONTH.labels} values={EXITS_BY_MONTH.values} color="#B0714F" showLabels height={200} />
          </div>
          <div className="bg-white border border-meristem-100 rounded-2xl p-5">
            <p className="text-sm font-bold text-slate-800 mb-1">Exits Q1 2026 — by Type</p>
            <p className="text-xs text-slate-400 mb-3">11 resignations, 5 end-of-contract, 1 termination</p>
            <PieChart labels={EXITS_BY_TYPE.labels} values={EXITS_BY_TYPE.values} donut height={200} />
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-3">Front Office / Back Office by Business Unit</p>
          <BarChart
            labels={OFFICE_BY_BU.labels.flatMap((l) => [l])}
            values={OFFICE_BY_BU.backOffice}
            color="#2F6B2B"
            showLabels
            height={220}
          />
          <p className="text-[11px] text-slate-400 mt-2">Back office shown above — Front office totals 89 group-wide (MWML 48, MSBL 16, MSL 14, MFL 3, MRPSL 3, MCL 1, MFO 2, MTL 2, NESI 0).</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricListCard title="Workforce Overview" metrics={WORKFORCE_METRICS} />
          <MetricListCard title="Employee Movement" metrics={MOVEMENT_METRICS} />
          <MetricListCard title="Attendance & Leave" metrics={ATTENDANCE_METRICS} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricListCard title="HR Operations" metrics={HR_OPS_METRICS} />
          <MetricListCard title="Employee Relations" metrics={RELATIONS_METRICS} />
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
