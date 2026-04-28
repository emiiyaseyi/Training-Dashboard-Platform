'use client'

import { useEffect, useRef } from 'react'
import type { PlotData, Layout } from 'plotly.js-dist-min'

interface BarChartProps {
  labels: string[]
  values: number[]
  color?: string
  height?: number
  horizontal?: boolean
}

export function BarChart({
  labels,
  values,
  color = '#3b82f6',
  height = 300,
  horizontal = false,
}: BarChartProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || labels.length === 0) return

    const maxLabelLen = horizontal ? Math.max(...labels.map((l) => l.length), 0) : 0
    const leftMargin = horizontal ? Math.min(Math.max(maxLabelLen * 6.5, 120), 300) : 50

    const data: PlotData[] = [
      {
        type: 'bar',
        x: horizontal ? values : labels,
        y: horizontal ? labels : values,
        orientation: horizontal ? 'h' : 'v',
        marker: { color },
        hovertemplate: horizontal
          ? '%{x:,.0f}<extra></extra>'
          : '%{y:,.0f}<extra></extra>',
      },
    ]

    const layout: Partial<Layout> = {
      height,
      margin: { t: 12, r: 20, b: horizontal ? 40 : 56, l: leftMargin },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'var(--font-inter, Inter, system-ui, sans-serif)', size: 11, color: '#64748b' },
      xaxis: {
        tickfont: { size: 10 },
        showgrid: !horizontal,
        gridcolor: '#f1f5f9',
        zeroline: false,
      },
      yaxis: {
        tickfont: { size: 10 },
        showgrid: horizontal,
        gridcolor: '#f1f5f9',
        zeroline: false,
        automargin: true,
      },
      bargap: 0.35,
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
  }, [JSON.stringify(labels), JSON.stringify(values), color, height, horizontal])

  return (
    <div ref={ref} style={{ width: '100%', minHeight: height }} className="plotly-chart" />
  )
}
