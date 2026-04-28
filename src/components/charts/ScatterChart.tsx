'use client'

import { useEffect, useRef } from 'react'
import type { PlotData, Layout } from 'plotly.js-dist-min'

interface ScatterPoint {
  x: number
  y: number
  label: string
}

interface ScatterChartProps {
  points: ScatterPoint[]
  xLabel?: string
  yLabel?: string
  height?: number
}

export function ScatterChart({ points, xLabel = 'Cost (₦)', yLabel = 'Impact Score (%)', height = 320 }: ScatterChartProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || points.length === 0) return

    const data: PlotData[] = [
      {
        type: 'scatter',
        mode: 'markers+text',
        x: points.map((p) => p.x),
        y: points.map((p) => p.y),
        text: points.map((p) => p.label),
        textposition: 'top center',
        marker: {
          size: 12,
          color: points.map((p) => p.y),
          colorscale: 'Blues',
          showscale: false,
          line: { color: '#fff', width: 1.5 },
        },
        hovertemplate: '<b>%{text}</b><br>Cost: ₦%{x:,.0f}<br>Impact: %{y:.1f}%<extra></extra>',
      },
    ]

    const layout: Partial<Layout> = {
      height,
      margin: { t: 20, r: 20, b: 56, l: 60 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'var(--font-inter, Inter, system-ui, sans-serif)', size: 11, color: '#64748b' },
      xaxis: {
        title: { text: xLabel, font: { size: 11 } },
        showgrid: true,
        gridcolor: '#f1f5f9',
        zeroline: false,
      },
      yaxis: {
        title: { text: yLabel, font: { size: 11 } },
        showgrid: true,
        gridcolor: '#f1f5f9',
        zeroline: false,
        range: [0, 105],
      },
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
  }, [JSON.stringify(points), xLabel, yLabel, height])

  return (
    <div ref={ref} style={{ width: '100%', minHeight: height }} className="plotly-chart" />
  )
}
