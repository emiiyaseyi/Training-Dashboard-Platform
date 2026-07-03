'use client'

import { useEffect, useRef } from 'react'
import type { PlotData, Layout } from 'plotly.js-dist-min'

const PALETTE = [
  '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
]

interface PieChartProps {
  labels: string[]
  values: number[]
  height?: number
  donut?: boolean
  showAmounts?: boolean
}

function fmtAmount(v: number): string {
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `₦${(v / 1_000).toFixed(1)}K`
  return `₦${v.toLocaleString()}`
}

export function PieChart({ labels, values, height = 300, donut = false, showAmounts = false }: PieChartProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || labels.length === 0) return

    const total = values.reduce((a, b) => a + b, 0)
    const sliceText = showAmounts
      ? values.map((v) => {
          const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0'
          return `${pct}%<br><b>${fmtAmount(v)}</b>`
        })
      : undefined

    const data: PlotData[] = [
      {
        type: 'pie',
        labels,
        values,
        hole: donut ? 0.5 : 0,
        marker: { colors: PALETTE },
        textinfo: showAmounts ? 'text' : 'percent',
        ...(sliceText && { text: sliceText }),
        hovertemplate: '%{label}: %{value:,.0f}<br>%{percent}<extra></extra>',
      } as PlotData,
    ]

    const layout: Partial<Layout> = {
      height,
      margin: { t: 8, r: 8, b: 8, l: 8 },
      paper_bgcolor: 'transparent',
      font: { family: 'var(--font-inter, Inter, system-ui, sans-serif)', size: 11, color: '#64748b' },
      legend: { orientation: 'h', y: -0.15, font: { size: 10 } },
      showlegend: true,
    }

    const el = ref.current
    import('plotly.js-dist-min').then((PlotlyModule) => {
      const Plotly = ((PlotlyModule as unknown as { default: unknown }).default ?? PlotlyModule) as typeof import('plotly.js-dist-min')
      if (el) Plotly.react(el, data, layout, { responsive: true, displayModeBar: false })
    })

    return () => {
      import('plotly.js-dist-min').then((PlotlyModule) => {
        const Plotly = ((PlotlyModule as unknown as { default: unknown }).default ?? PlotlyModule) as typeof import('plotly.js-dist-min')
        if (el) Plotly.purge(el)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(labels), JSON.stringify(values), height, donut])

  return (
    <div ref={ref} style={{ width: '100%', minHeight: height }} className="plotly-chart" />
  )
}
