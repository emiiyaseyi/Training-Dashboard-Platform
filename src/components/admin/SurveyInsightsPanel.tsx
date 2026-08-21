'use client'

import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { DataTable } from '@/components/ui/DataTable'

interface StageRate { stage: string; sent: number; responded: number; ratePct: number }
interface CommentEntry { source: string; businessUnit: string; training: string; staffName: string | null; text: string; date: string }
interface InsightsData { responseRateByStage: StageRate[]; comments: CommentEntry[] }

interface RatingSummary {
  avgRoleRelevance: number
  avgExpectationsMet: number
  avgVendorRating: number
  postTrainingImpactScore: number
  postTrainingReviewCount: number
  vendorPerformance: { training: string; vendorName: string; avgRating: number; responses: number }[]
}

const STAGE_LABELS: Record<string, string> = { pre: 'Pre-Training', post1: 'Post-1', post2: 'Post-2' }

function rating(n: number) { return n > 0 ? `${n.toFixed(1)}/5` : 'No data' }

export function SurveyInsightsPanel() {
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [ratings, setRatings] = useState<RatingSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/survey-insights').then((r) => r.json()),
      fetch('/api/analytics/group?full=true').then((r) => r.json()),
    ])
      .then(([i, g]) => { setInsights(i); setRatings(g) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <SectionCard
      icon={BarChart3}
      title="Survey Insights"
      description="Response rates, rating trends, and open-text feedback across all surveyed trainings."
    >
      {loading || !insights || !ratings ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {insights.responseRateByStage.map((s) => (
              <div key={s.stage} className="border border-slate-100 rounded-lg p-3">
                <p className="text-xs text-slate-500">{STAGE_LABELS[s.stage] || s.stage} Response Rate</p>
                <p className="text-xl font-semibold text-navy-700 mt-1">{s.sent > 0 ? `${s.ratePct.toFixed(0)}%` : '—'}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{s.responded} of {s.sent} sent</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Avg Role Relevance</p>
              <p className="text-lg font-semibold text-navy-700 mt-1">{rating(ratings.avgRoleRelevance)}</p>
            </div>
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Avg Expectations Met</p>
              <p className="text-lg font-semibold text-navy-700 mt-1">{rating(ratings.avgExpectationsMet)}</p>
            </div>
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Avg Vendor Rating</p>
              <p className="text-lg font-semibold text-navy-700 mt-1">{rating(ratings.avgVendorRating)}</p>
            </div>
            <div className="border border-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-500">Post-Training Impact</p>
              <p className="text-lg font-semibold text-navy-700 mt-1">{ratings.postTrainingReviewCount > 0 ? rating(ratings.postTrainingImpactScore) : 'No data'}</p>
            </div>
          </div>

          {ratings.vendorPerformance.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Vendor Performance</p>
              <DataTable
                columns={[
                  { key: 'vendorName', header: 'Vendor' },
                  { key: 'training', header: 'Training' },
                  { key: 'avgRating', header: 'Avg Rating', align: 'right', render: (r) => rating(r.avgRating as number) },
                  { key: 'responses', header: 'Responses', align: 'right' },
                ]}
                data={ratings.vendorPerformance as unknown as Record<string, unknown>[]}
                pageSize={5}
              />
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">Recent Comments ({insights.comments.length})</p>
            <DataTable
              columns={[
                { key: 'date', header: 'Date', render: (r) => new Date(r.date as string).toLocaleDateString() },
                { key: 'source', header: 'Source' },
                { key: 'training', header: 'Training' },
                { key: 'businessUnit', header: 'Business Unit' },
                { key: 'text', header: 'Comment' },
              ]}
              data={insights.comments as unknown as Record<string, unknown>[]}
              emptyMessage="No open-text feedback recorded yet."
              pageSize={10}
            />
          </div>
        </div>
      )}
    </SectionCard>
  )
}
