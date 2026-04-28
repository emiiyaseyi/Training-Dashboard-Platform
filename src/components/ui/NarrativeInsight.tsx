import { Lightbulb } from 'lucide-react'

interface NarrativeInsightProps {
  insights: string[]
  title?: string
}

export function NarrativeInsight({ insights, title = 'Executive Insights' }: NarrativeInsightProps) {
  if (!insights || insights.length === 0) return null

  return (
    <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-blue-600" />
        </div>
        <h3 className="text-sm font-semibold text-blue-900">{title}</h3>
      </div>
      <ul className="space-y-2.5">
        {insights.map((insight, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            <p className="text-sm text-slate-700 leading-relaxed">{insight}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
