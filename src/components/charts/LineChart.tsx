'use client'

import { useEffect, useRef } from 'react'
import type { PlotData, Layout } from 'plotly.js-dist-min'

interface LineChartProps {
  labels: string[]
  values: number[]
  color?: string
  height?: number
  filled?: boolean
}

export function LineChart({ labels, values, color = '#3b82f6', height = 280, filled = true }: LineChartProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || labels.length === 0) return

    const data: PlotData[] = [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x: labels,
        y: values,
        line: { color, width: 2.5, shape: 'spline' },
        marker: { color, size: 5 },
        fill: filled ? 'tozeroy' : undefined,
        fillcolor: filled ? `${color}18` : undefined,
        hovertemplate: '%{y:,.0f}<extra></extra>',
      },
    ]

    const layout: Partial<Layout> = {
      height,
      margin: { t: 12, r: 12, b: 48, l: 60 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'var(--font-inter, Inter, system-ui, sans-serif)', size: 11, color: '#64748b' },
      xaxis: { showgrid: false, zeroline: false, tickfont: { size: 10 } },
      yaxis: { showgrid: true, gridcolor: '#f1f5f9', zeroline: false, tickfont: { size: 10 } },
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
  }, [JSON.stringify(labels), JSON.stringify(values), color, height, filled])

  return (
    <div ref={ref} style={{ width: '100%', minHeight: height }} className="plotly-chart" />
  )
}
