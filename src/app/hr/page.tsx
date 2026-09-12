'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { LayoutGrid, Rows3, LayoutDashboard } from 'lucide-react'
import { hasAccess, HR_UNIT_KEYS, PAGE_ROUTES } from '@/lib/permissions'

// Three interchangeable visual treatments for the same underlying figures — trialled as five
// artifact mockups with the business, narrowed to these three. "Signal Board" is the default;
// "Ledger Grid" and "Executive Blocks" are alternate skins a viewer can switch to and back from
// at any time (their choice is remembered locally, per browser — it is a display preference,
// not organisation policy, so it does not need to live in the database).
type Layout = 'signal' | 'ledger' | 'executive'
const LAYOUT_STORAGE_KEY = 'hr-summary-layout'

// Real figures where the HR Report — 1st Quarter 2026 gives them; placeholders (marked as such
// in the UI) where a unit's live data source is not yet connected — see each unit's own page for
// the caveat on its numbers. Kept as one object so all three layouts read the same source of
// truth instead of three copies of the same figures.
const METRICS = {
  headcount: 329, male: 161, female: 168,
  attritionTrend: [5.1, 4.6, 4.3, 4.0],
  attritionLabels: ['Q2 25', 'Q3 25', 'Q4 25', 'Q1 26'],
  entities: [
    { name: 'MSL', headcount: 128, loan: 41.0 },
    { name: 'WDJM', headcount: 81, loan: 19.4 },
    { name: 'MSBL', headcount: 52, loan: 13.6 },
    { name: 'Others', headcount: 68, loan: 22.4 },
  ],
  joiners: 24, exits: 19,
  ta: { timeToFill: 34, openRoles: 18, offerAcceptance: 72 },
  ld: { investment: '₦22.5M', coverage: 5.5, impact: 4.3, completion: 91 },
  pm: { reviewed: 80, avgRating: 4.1 },
  tm: { pool: 84, promotion: 18, mobility: 22, committee: 31, tenureBuckets: [22, 31, 19, 12] },
  cb: { loanBook: '₦96.4M', beneficiaries: 36, entitiesCovered: 7 },
  successionCovered: 14, successionTotal: 22,
  hrServiceResolution: 88,
}

function Ring({ pct, color, track, size = 84, hole = 60, children }: { pct: number; color: string; track: string; size?: number; hole?: number; children: React.ReactNode }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `conic-gradient(${color} ${pct}%, ${track} ${pct}% 100%)` }}
    >
      <div className="rounded-full bg-white flex flex-col items-center justify-center" style={{ width: hole, height: hole }}>
        {children}
      </div>
    </div>
  )
}

function HBar({ label, pct, value, color }: { label: string; pct: number; value: string; color: string }) {
  return (
    <div className="grid grid-cols-[64px_1fr_44px] items-center gap-2 text-[11.5px]">
      <span className="text-slate-500">{label}</span>
      <div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full rounded" style={{ width: `${pct}%`, background: color }} /></div>
      <span className="text-right font-semibold text-slate-700 tabular-nums">{value}</span>
    </div>
  )
}

const LAYOUT_OPTIONS: { key: Layout; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'signal', label: 'Signal Board', icon: LayoutGrid },
  { key: 'ledger', label: 'Ledger Grid', icon: Rows3 },
  { key: 'executive', label: 'Executive Blocks', icon: LayoutDashboard },
]

function LayoutSwitcher({ layout, onChange }: { layout: Layout; onChange: (l: Layout) => void }) {
  return (
    <div className="inline-flex bg-meristem-50 border border-meristem-100 rounded-full p-1 gap-1">
      {LAYOUT_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
            layout === opt.key ? 'bg-white text-meristem-800 shadow-sm' : 'text-slate-500 hover:text-meristem-700'
          }`}
        >
          <opt.icon className="w-3.5 h-3.5" />
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const ATTENTION_ITEMS = [
  { level: 'watch' as const, text: 'Performance contract reviews sit at 80% against a 100% target, with three weeks left in the cycle.' },
  { level: 'watch' as const, text: 'Only 31% of the Talent Management pool holds a Strategic Committee seat — 8 of 22 critical roles have no identified successor.' },
  { level: 'pending' as const, text: 'Talent Acquisition figures are provisional until the live recruitment sheet finishes connecting.' },
  { level: 'positive' as const, text: 'Group attrition held at 4.0%, a full point under the 5.0% industry benchmark, for the second straight quarter.' },
]

const ATTENTION_STYLES = {
  watch: 'bg-amber-50 text-amber-700',
  pending: 'bg-rose-50 text-rose-700',
  positive: 'bg-meristem-50 text-meristem-800',
}
const ATTENTION_LABELS = { watch: 'Watch', pending: 'Pending', positive: 'Positive' }

function AttentionPanel() {
  return (
    <div className="bg-white border border-meristem-100 rounded-2xl p-5">
      <p className="text-sm font-bold text-slate-800 mb-3">Executive attention required</p>
      <div className="divide-y divide-meristem-50">
        {ATTENTION_ITEMS.map((item) => (
          <div key={item.text} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${ATTENTION_STYLES[item.level]}`}>
              {ATTENTION_LABELS[item.level]}
            </span>
            <span className="text-xs text-slate-600 leading-relaxed">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Layout 1: Signal Board — colour-coded KPI strip + a grid of chart cards, one per metric ----
function SignalBoard() {
  const m = METRICS
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Workforce', value: m.headcount, sub: 'headcount, group‑wide', bg: 'bg-meristem-700' },
          { label: 'Attrition', value: '4.0%', sub: '↓ vs. 5.0% industry', bg: 'bg-sky-700' },
          { label: 'Hiring (TA)', value: `${m.ta.timeToFill}d`, sub: 'avg. time to fill', bg: 'bg-amber-600' },
          { label: 'Learning', value: m.ld.investment, sub: 'YTD investment', bg: 'bg-meristem-500' },
          { label: 'Performance', value: `${m.pm.reviewed}%`, sub: 'contracts reviewed', bg: 'bg-lime-700' },
          { label: 'Talent Mgmt', value: m.tm.pool, sub: `${m.tm.promotion}% promoted`, bg: 'bg-orange-800' },
        ].map((k) => (
          <div key={k.label} className={`${k.bg} text-white rounded-2xl p-4 flex flex-col justify-between min-h-[86px]`}>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{k.label}</p>
            <div>
              <p className="text-xl font-extrabold tabular-nums">{k.value}</p>
              <p className="text-[11px] font-medium opacity-85">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href={PAGE_ROUTES['hr-employee-services']} className="bg-white border border-meristem-100 rounded-2xl p-4 hover:border-meristem-300 transition-colors">
          <p className="text-xs font-bold text-slate-700 mb-3">Headcount by Gender <span className="block font-normal text-slate-400">{m.headcount} total</span></p>
          <div className="flex items-center gap-4">
            <Ring pct={49} color="#2F6B2B" track="#8FBF6E"><span className="text-sm font-extrabold">{m.headcount}</span><span className="text-[8px] text-slate-400">staff</span></Ring>
            <div className="text-[11px] space-y-1">
              <div className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-meristem-700 inline-block" />Male — {m.male} (49%)</div>
              <div className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-lime-500 inline-block" />Female — {m.female} (51%)</div>
            </div>
          </div>
        </Link>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Attrition vs. Industry <span className="block font-normal text-slate-400">Trailing 4 quarters</span></p>
          <div className="flex items-end gap-2 h-20">
            {m.attritionTrend.map((v, i) => (
              <div key={m.attritionLabels[i]} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10px] font-bold">{v}%</span>
                <div className={`w-full rounded-t ${i === m.attritionTrend.length - 1 ? 'bg-meristem-700' : 'bg-meristem-200'}`} style={{ height: `${(v / 5.5) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-1">{m.attritionLabels.map((l) => <span key={l} className="flex-1 text-center text-[9.5px] text-slate-400">{l}</span>)}</div>
        </div>

        <Link href={PAGE_ROUTES['hr-talent-acquisition']} className="bg-white border border-meristem-100 rounded-2xl p-4 hover:border-meristem-300 transition-colors">
          <p className="text-xs font-bold text-slate-700 mb-1">Talent Acquisition <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 rounded-full px-2 py-0.5 align-middle">data pending</span></p>
          <div className="space-y-1.5 mt-3">
            <HBar label="Time to fill" pct={68} value={`${m.ta.timeToFill}d`} color="#B8862E" />
            <HBar label="Open roles" pct={40} value={String(m.ta.openRoles)} color="#B8862E" />
            <HBar label="Offer accept." pct={m.ta.offerAcceptance} value={`${m.ta.offerAcceptance}%`} color="#B8862E" />
          </div>
        </Link>

        <Link href={PAGE_ROUTES['hr-learning-development']} className="bg-white border border-meristem-100 rounded-2xl p-4 hover:border-meristem-300 transition-colors">
          <p className="text-xs font-bold text-slate-700 mb-1">Learning &amp; Development <span className="block font-normal text-slate-400">{m.ld.investment} invested YTD</span></p>
          <div className="space-y-1.5 mt-3">
            <HBar label="Coverage" pct={m.ld.coverage * 10} value={`${m.ld.coverage}%`} color="#3F7A38" />
            <HBar label="Impact" pct={m.ld.impact * 20} value={`${m.ld.impact}/5`} color="#3F7A38" />
            <HBar label="Completion" pct={m.ld.completion} value={`${m.ld.completion}%`} color="#3F7A38" />
          </div>
        </Link>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4 sm:col-span-2">
          <p className="text-xs font-bold text-slate-700 mb-3">Staff Loan Portfolio by Entity <span className="font-normal text-slate-400">{METRICS.cb.loanBook} across {METRICS.cb.entitiesCovered} entities</span></p>
          <div className="flex items-end gap-3 h-24">
            {m.entities.map((e) => (
              <div key={e.name} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10px] font-bold tabular-nums">{e.loan}</span>
                <div className="w-full rounded-t bg-orange-700" style={{ height: `${(e.loan / 41) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-1">{m.entities.map((e) => <span key={e.name} className="flex-1 text-center text-[9.5px] text-slate-400">{e.name}</span>)}</div>
        </div>

        <Link href={PAGE_ROUTES['hr-talent-management']} className="bg-white border border-meristem-100 rounded-2xl p-4 hover:border-meristem-300 transition-colors sm:col-span-2">
          <p className="text-xs font-bold text-slate-700 mb-3">Talent Management — Pool by Tenure <span className="font-normal text-slate-400">{m.tm.pool} staff, {m.tm.promotion}% promoted</span></p>
          <div className="flex items-end gap-3 h-20">
            {['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'].map((label, i) => (
              <div key={label} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10px] font-bold">{m.tm.tenureBuckets[i]}</span>
                <div className="w-full rounded-t bg-orange-800" style={{ height: `${(m.tm.tenureBuckets[i] / 31) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-1">{['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'].map((l) => <span key={l} className="flex-1 text-center text-[9.5px] text-slate-400">{l}</span>)}</div>
        </Link>

        <Link href={PAGE_ROUTES['hr-performance-management']} className="bg-white border border-meristem-100 rounded-2xl p-4 hover:border-meristem-300 transition-colors">
          <p className="text-xs font-bold text-slate-700 mb-3">Performance Ratings <span className="block font-normal text-slate-400">Half‑year average, out of 5</span></p>
          <div className="flex items-end gap-2 h-20">
            {[3.8, 4.0, 4.1].map((v, i) => (
              <div key={v} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10px] font-bold">{v}</span>
                <div className={`w-full rounded-t ${i === 2 ? 'bg-lime-700' : 'bg-lime-200'}`} style={{ height: `${(v / 4.1) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-1">{['H1 25', 'H2 25', 'H1 26'].map((l) => <span key={l} className="flex-1 text-center text-[9.5px] text-slate-400">{l}</span>)}</div>
        </Link>

        <Link href={PAGE_ROUTES['hr-talent-management']} className="bg-white border border-meristem-100 rounded-2xl p-4 hover:border-meristem-300 transition-colors">
          <p className="text-xs font-bold text-slate-700 mb-3">Committee Involvement <span className="block font-normal text-slate-400">Talent Management pool</span></p>
          <div className="flex items-center gap-4">
            <Ring pct={m.tm.committee} color="#9A4A2E" track="#F1E4DD"><span className="text-sm font-extrabold">{m.tm.committee}%</span><span className="text-[8px] text-slate-400">on cmte.</span></Ring>
            <div className="text-[11px] space-y-1">
              <div className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-orange-800 inline-block" />On a committee</div>
              <div className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-orange-100 inline-block" />Not yet assigned</div>
            </div>
          </div>
        </Link>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Critical Roles &amp; Succession</p>
          <div className="flex items-center gap-4">
            <Ring pct={(m.successionCovered / m.successionTotal) * 100} color="#B0714F" track="#F1E4DD"><span className="text-sm font-extrabold">{m.successionCovered}/{m.successionTotal}</span><span className="text-[8px] text-slate-400">covered</span></Ring>
            <div className="text-[11px] text-slate-500 space-y-1">
              <div>64% succession coverage</div>
              <div className="text-amber-600 font-semibold">{m.successionTotal - m.successionCovered} roles unsuccessored</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">HR Service Requests <span className="block font-normal text-slate-400">Employee Services help‑desk</span></p>
          <div className="flex items-center gap-4">
            <Ring pct={m.hrServiceResolution} color="#2F6B2B" track="#E7EFE3"><span className="text-sm font-extrabold">{m.hrServiceResolution}%</span><span className="text-[8px] text-slate-400">resolved</span></Ring>
            <div className="text-[11px] text-slate-500 space-y-1">
              <div>Within SLA, Q1 2026</div>
              <div>312 requests logged</div>
            </div>
          </div>
        </div>
      </div>

      <AttentionPanel />
    </div>
  )
}

// ---- Layout 2: Ledger Grid — a compact BI-style KPI row + report table ----
function LedgerGrid() {
  const m = METRICS
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-meristem-100 border border-meristem-100 rounded-xl overflow-hidden">
        {[
          { k: 'Headcount', v: m.headcount, d: '↑ 1.8% QoQ', up: true },
          { k: 'Attrition', v: '4.0%', d: '↓ 0.6pp', up: true },
          { k: 'Time to fill', v: `${m.ta.timeToFill}d`, d: '↑ 3d', up: false },
          { k: 'Training spend', v: m.ld.investment, d: '↑ 12%', up: true },
          { k: 'Reviews done', v: `${m.pm.reviewed}%`, d: '↑ 6pp', up: true },
          { k: 'Loan book', v: METRICS.cb.loanBook, d: '↑ 4%', up: true },
        ].map((c) => (
          <div key={c.k} className="bg-white p-3.5">
            <p className="font-mono text-lg font-semibold text-slate-800 tabular-nums">{c.v}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{c.k}</p>
            <p className={`text-[10px] font-semibold mt-1 ${c.up ? 'text-meristem-700' : 'text-rose-500'}`}>{c.d}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-meristem-100 rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <caption className="sr-only">Unit breakdown</caption>
          <thead>
            <tr className="bg-meristem-50 text-slate-500 uppercase text-[10px] tracking-wide">
              <th className="text-left px-4 py-2.5 font-semibold">Unit</th>
              <th className="text-right px-3 py-2.5 font-semibold">Primary</th>
              <th className="text-right px-3 py-2.5 font-semibold">Secondary</th>
              <th className="text-right px-3 py-2.5 font-semibold">Tertiary</th>
              <th className="text-left px-3 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-meristem-50">
            {[
              { href: PAGE_ROUTES['hr-employee-services'], name: 'Employee Services', a: `${m.headcount} hc`, b: '3.2 yr tenure', c: '4.0% attr.', status: 'on' as const },
              { href: PAGE_ROUTES['hr-talent-acquisition'], name: 'Talent Acquisition', a: `${m.ta.timeToFill}d fill`, b: `${m.ta.openRoles} open`, c: `${m.ta.offerAcceptance}% accept.`, status: 'pending' as const },
              { href: PAGE_ROUTES['hr-learning-development'], name: 'Learning & Development', a: `${m.ld.investment} YTD`, b: `${m.ld.coverage}% coverage`, c: `${m.ld.impact}/5 impact`, status: 'on' as const },
              { href: PAGE_ROUTES['hr-performance-management'], name: 'Performance Management', a: `${m.pm.reviewed}% reviewed`, b: `${m.pm.avgRating}/5 rating`, c: '—', status: 'watch' as const },
              { href: PAGE_ROUTES['hr-talent-management'], name: 'Talent Management', a: `${m.tm.pool} pool`, b: `${m.tm.promotion}% promoted`, c: `${m.tm.mobility}% mobility`, status: 'watch' as const },
              { href: PAGE_ROUTES['hr-compensation-benefits'], name: 'Compensation & Benefits', a: METRICS.cb.loanBook, b: `${METRICS.cb.beneficiaries} benef.`, c: `${METRICS.cb.entitiesCovered} entities`, status: 'on' as const },
            ].map((row) => (
              <tr key={row.name} className="hover:bg-meristem-50/60">
                <td className="px-4 py-2.5"><Link href={row.href} className="font-semibold text-slate-700 hover:text-meristem-800">{row.name}</Link></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{row.a}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{row.b}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{row.c}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${row.status === 'on' ? 'bg-meristem-600' : row.status === 'watch' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AttentionPanel />
    </div>
  )
}

// ---- Layout 3: Executive Blocks — colour-coded pillar headers over each unit's stat block ----
function ExecutiveBlocks() {
  const m = METRICS
  const blocks: { key: keyof typeof PAGE_ROUTES; label: string; color: string; value: string | number; sub: string; a: [string, string]; b: [string, string] }[] = [
    { key: 'hr-employee-services', label: 'Employee Services', color: 'bg-meristem-700', value: m.headcount, sub: 'headcount', a: ['Male', String(m.male)], b: ['Female', String(m.female)] },
    { key: 'hr-talent-acquisition', label: 'Talent Acquisition', color: 'bg-amber-600', value: m.ta.openRoles, sub: 'open roles', a: ['Time to fill', `${m.ta.timeToFill}d`], b: ['Accepted', `${m.ta.offerAcceptance}%`] },
    { key: 'hr-learning-development', label: 'Learning & Dev.', color: 'bg-sky-700', value: m.ld.investment, sub: 'YTD invested', a: ['Coverage', `${m.ld.coverage}%`], b: ['Impact', `${m.ld.impact}/5`] },
    { key: 'hr-performance-management', label: 'Performance', color: 'bg-violet-600', value: `${m.pm.reviewed}%`, sub: 'reviewed', a: ['Avg. rating', `${m.pm.avgRating}/5`], b: ['Target', '100%'] },
    { key: 'hr-talent-management', label: 'Talent Mgmt.', color: 'bg-orange-800', value: m.tm.pool, sub: 'TM pool', a: ['Promoted', `${m.tm.promotion}%`], b: ['Committee', `${m.tm.committee}%`] },
    { key: 'hr-compensation-benefits', label: 'Comp. & Benefits', color: 'bg-lime-700', value: METRICS.cb.loanBook, sub: 'loan book', a: ['Benef.', String(METRICS.cb.beneficiaries)], b: ['Entities', String(METRICS.cb.entitiesCovered)] },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {blocks.map((b) => (
          <Link key={b.label} href={PAGE_ROUTES[b.key]} className="flex flex-col gap-2">
            <div className={`${b.color} text-white text-center rounded-lg py-2.5 text-xs font-bold`}>{b.label}</div>
            <div className="bg-white border border-meristem-100 rounded-lg p-3.5 text-center min-h-[112px] flex flex-col">
              <p className="text-xl font-extrabold text-slate-800 tabular-nums">{b.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{b.sub}</p>
              <div className="flex justify-between mt-auto pt-2 border-t border-meristem-50 text-[10px] text-slate-400">
                <div><b className="block text-slate-700 text-xs font-bold">{b.a[1]}</b>{b.a[0]}</div>
                <div><b className="block text-slate-700 text-xs font-bold">{b.b[1]}</b>{b.b[0]}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-meristem-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Headcount by entity</p>
          <div className="space-y-2">
            {m.entities.map((e) => (
              <HBar key={e.name} label={e.name} pct={(e.headcount / 128) * 100} value={String(e.headcount)} color="#2F6B2B" />
            ))}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Attrition, trailing 4Q</p>
          <div className="space-y-2">
            {m.attritionLabels.map((l, i) => (
              <HBar key={l} label={l} pct={(m.attritionTrend[i] / 5.1) * 100} value={`${m.attritionTrend[i]}%`} color={i === 3 ? '#2F6B2B' : '#B8862E'} />
            ))}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4 flex flex-col items-center justify-center">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 self-start">Performance reviews</p>
          <Ring pct={m.pm.reviewed} color="#7A66B0" track="#EFEAF7" size={96} hole={68}>
            <span className="text-lg font-extrabold">{m.pm.reviewed}%</span><span className="text-[9px] text-slate-400">vs. 100%</span>
          </Ring>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Loan portfolio by entity</p>
          <div className="space-y-2">
            {m.entities.map((e) => (
              <HBar key={e.name} label={e.name} pct={(e.loan / 41) * 100} value={e.loan.toFixed(1)} color="#3F7A38" />
            ))}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">TM pool by tenure</p>
          <div className="space-y-2">
            {['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'].map((l, i) => (
              <HBar key={l} label={l} pct={(m.tm.tenureBuckets[i] / 31) * 100} value={String(m.tm.tenureBuckets[i])} color="#9A4A2E" />
            ))}
          </div>
        </div>

        <div className="bg-white border border-meristem-100 rounded-2xl p-4 flex flex-col items-center justify-center">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 self-start">L&amp;D impact score</p>
          <Ring pct={m.ld.impact * 20} color="#3F7590" track="#E7F0F4" size={96} hole={68}>
            <span className="text-lg font-extrabold">{m.ld.impact}</span><span className="text-[9px] text-slate-400">/ 5.0</span>
          </Ring>
        </div>
      </div>

      <AttentionPanel />
    </div>
  )
}

export default function HrSummaryPage() {
  const { data: session } = useSession()
  const [layout, setLayout] = useState<Layout>('signal')

  useEffect(() => {
    const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (saved === 'signal' || saved === 'ledger' || saved === 'executive') setLayout(saved)
  }, [])

  const changeLayout = (l: Layout) => {
    setLayout(l)
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, l)
  }

  if (!session?.user) return null

  const isSuperAdmin = session.user.isSuperAdmin
  const hasAnyUnit = HR_UNIT_KEYS.some((key) => isSuperAdmin || hasAccess(session.user.permissions?.[key], 'view'))

  return (
    <div className="p-4 sm:p-8 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">HR Summary</h1>
          <p className="text-sm text-slate-500 mt-1">Group‑wide highlights across every HR unit — click any card to open that unit&apos;s full report.</p>
        </div>
        <LayoutSwitcher layout={layout} onChange={changeLayout} />
      </div>

      {!hasAnyUnit ? (
        <div className="bg-white border border-meristem-100 rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500">You don&apos;t have access to any HR unit yet. Contact your administrator.</p>
        </div>
      ) : layout === 'signal' ? (
        <SignalBoard />
      ) : layout === 'ledger' ? (
        <LedgerGrid />
      ) : (
        <ExecutiveBlocks />
      )}
    </div>
  )
}
