'use client'

import { AlertTriangle, AlertCircle, Brain, TrendingUp, Target, BarChart2, BadgeCheck, Zap } from 'lucide-react'
import type { LearningIntelligence, RedFlag } from '@/lib/analytics'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}
function pct(n: number) { return `${n.toFixed(1)}%` }

// ── Styled card matching KPICard layout ───────────────────────────────────────

const colorMap = {
  blue:   { icon: 'bg-blue-100 text-blue-600',   value: 'text-blue-700',   bg: '' },
  green:  { icon: 'bg-green-100 text-green-600',  value: 'text-green-700',  bg: '' },
  purple: { icon: 'bg-purple-100 text-purple-600',value: 'text-purple-700', bg: '' },
  amber:  { icon: 'bg-amber-100 text-amber-600',  value: 'text-amber-700',  bg: '' },
  red:    { icon: 'bg-red-100 text-red-600',      value: 'text-red-700',    bg: '' },
  slate:  { icon: 'bg-slate-100 text-slate-600',  value: 'text-slate-700',  bg: '' },
}

type ColorKey = keyof typeof colorMap

function ICard({
  icon: Icon,
  title,
  value,
  subtitle,
  color,
  tag,
  tagColor,
  alert,
}: {
  icon: React.ElementType
  title: string
  value: string
  subtitle?: string
  color: ColorKey
  tag?: string
  tagColor?: string
  alert?: boolean
}) {
  const c = colorMap[color]
  return (
    <div className={`rounded-xl border ${alert ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'} p-5 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${alert ? 'bg-red-100 text-red-600' : c.icon}`}>
          <Icon className="w-5 h-5" />
        </div>
        {tag && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tagColor ?? 'bg-slate-100 text-slate-600'}`}>
            {tag}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className={`text-2xl font-bold tabular-nums mt-0.5 ${alert ? 'text-red-700' : c.value}`}>{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── LCI card with progress bar ────────────────────────────────────────────────

const LCI_DESCRIPTIONS: Record<string, string> = {
  Emerging:   'Learning is in its early stages. Participation is limited and cultural embedding requires deliberate acceleration.',
  Developing: 'Strong foundations are present with growing breadth and depth. Keep building consistency.',
  Mature:     'Learning is deeply embedded and consistently delivering strategic value across the organisation.',
}

function LCICard({ lci, lciLabel }: { lci: number; lciLabel: string }) {
  const color: ColorKey = lciLabel === 'Mature' ? 'green' : lciLabel === 'Developing' ? 'amber' : 'red'
  const tagColor =
    lciLabel === 'Mature'     ? 'bg-green-100 text-green-700' :
    lciLabel === 'Developing' ? 'bg-amber-100 text-amber-700' :
                                 'bg-red-100 text-red-700'
  const barColor =
    lciLabel === 'Mature' ? 'bg-green-500' : lciLabel === 'Developing' ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color].icon}`}>
          <Brain className="w-5 h-5" />
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tagColor}`}>{lciLabel}</span>
      </div>
      <div className="mt-4">
        <p className="text-sm text-slate-500 font-medium">Learning Culture Index</p>
        <p className={`text-2xl font-bold tabular-nums mt-0.5 ${colorMap[color].value}`}>
          {lci}<span className="text-sm font-normal text-slate-400">/100</span>
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${lci}%` }} />
        </div>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{LCI_DESCRIPTIONS[lciLabel]}</p>
      </div>
    </div>
  )
}

// ── Red Flag block ────────────────────────────────────────────────────────────

function RedFlagCard({ flags }: { flags: RedFlag[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${flags.length === 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
          {flags.length === 0 ? <AlertCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
        </div>
        <div className="mt-2">
          <p className="text-sm text-slate-500 font-medium">Red Flag Engine</p>
        </div>
      </div>
      {flags.length === 0 ? (
        <p className="text-sm font-semibold text-green-700 tabular-nums">No flags raised</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f, i) => (
            <span key={i} className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
              f.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {f.severity === 'critical'
                ? <AlertCircle className="w-3 h-3 shrink-0" />
                : <AlertTriangle className="w-3 h-3 shrink-0" />}
              {f.message}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Benchmarking card ─────────────────────────────────────────────────────────

function BenchmarkCard({
  topBU, bottomBU,
}: {
  topBU: { name: string; lci: number; lciLabel: string } | null
  bottomBU: { name: string; lci: number; lciLabel: string } | null
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-100 text-purple-600">
          <BarChart2 className="w-5 h-5" />
        </div>
        <div className="mt-2">
          <p className="text-sm text-slate-500 font-medium">Benchmarking</p>
        </div>
      </div>
      {!topBU ? (
        <p className="text-xs text-slate-400">Set staff headcounts in Admin Settings to enable LCI benchmarking.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 shrink-0 mt-0.5">TOP</span>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">{topBU.name}</p>
              <p className="text-xs text-green-600">LCI {topBU.lci}/100 · {topBU.lciLabel}</p>
            </div>
          </div>
          {bottomBU && (
            <div className="flex items-start gap-2 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0 mt-0.5">LOW</span>
              <div>
                <p className="text-sm font-semibold text-slate-800 leading-tight">{bottomBU.name}</p>
                <p className="text-xs text-amber-600">LCI {bottomBU.lci}/100 · {bottomBU.lciLabel}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  li: LearningIntelligence
  showSubscription?: boolean
}

export function LearningIntelligenceLayer({ li, showSubscription = true }: Props) {
  const feedbackColor: ColorKey =
    li.feedbackCredibility >= 50 ? 'green' :
    li.feedbackCredibility >= 20 ? 'amber' : 'red'

  const feedbackTag = li.feedbackCredibilityLabel
  const feedbackTagColor =
    li.feedbackCredibilityLabel === 'High Confidence' ? 'bg-green-100 text-green-700' :
    li.feedbackCredibilityLabel === 'Moderate'        ? 'bg-amber-100 text-amber-700' :
                                                         'bg-red-100 text-red-700'

  const depthColor: ColorKey = li.learningDepth >= 2 ? 'green' : li.learningDepth >= 1 ? 'amber' : 'red'
  const depthTag = li.learningDepth >= 2 ? 'Deep' : li.learningDepth >= 1 ? 'Moderate' : 'Shallow'
  const depthTagColor = li.learningDepth >= 2 ? 'bg-green-100 text-green-700' : li.learningDepth >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'

  const ineqColor: ColorKey = li.participationInequality > 50 ? 'red' : li.participationInequality > 35 ? 'amber' : 'green'
  const ineqTag = li.participationInequality > 50 ? 'High Concentration' : li.participationInequality > 35 ? 'Moderate' : 'Well Distributed'
  const ineqTagColor = li.participationInequality > 50 ? 'bg-red-100 text-red-700' : li.participationInequality > 35 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="w-1 h-6 rounded-full bg-blue-500" />
        <h2 className="text-sm font-bold text-slate-800">Learning Intelligence & Risk Layer</h2>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
          A second voice
        </span>
      </div>

      {/* Row 1 — Core Intelligence Metrics (3 cards; Investment per Staff is already in exec summary) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ICard icon={TrendingUp} title="Learning Depth" value={`${li.learningDepth.toFixed(1)}x`} subtitle="Avg trainings per staff" color={depthColor} tag={depthTag} tagColor={depthTagColor} />
        <LCICard lci={li.lci} lciLabel={li.lciLabel} />
        <ICard icon={BadgeCheck} title="Feedback Credibility" value={pct(li.feedbackCredibility)} subtitle="Feedback coverage" color={feedbackColor} tag={feedbackTag} tagColor={feedbackTagColor} />
      </div>

      {/* Row 2 — Risk & Distribution Signals */}
      <div className={`grid gap-4 ${showSubscription ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-3'}`}>
        <ICard icon={Target} title="Participation Inequality" value={pct(li.participationInequality)} subtitle="Top 20% staff contribution" color={ineqColor} tag={ineqTag} tagColor={ineqTagColor} />
        {showSubscription && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-100 text-purple-600">
                <Zap className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500 font-medium">Subscription ROI Proxy</p>
              <p className="text-2xl font-bold tabular-nums mt-0.5 text-purple-700">{pct(li.subscriptionActivationRate)}</p>
              <p className="text-xs text-slate-400 mt-1">Active membership rate</p>
              <p className="text-xs text-slate-500 tabular-nums mt-1 font-medium">{fmt(li.subscriptionCostPerMember)} <span className="text-slate-400 font-normal">per active member</span></p>
            </div>
          </div>
        )}
        <RedFlagCard flags={li.redFlags} />
        <BenchmarkCard topBU={li.topBU} bottomBU={li.bottomBU} />
      </div>

      {/* Row 3 — Intelligence Narrative */}
      {li.narrative.length > 0 && (
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-blue-900 mb-3">What This Means</p>
          <ul className="space-y-2.5">
            {li.narrative.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                <p className="text-sm text-slate-700 leading-relaxed">{s}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
