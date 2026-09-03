'use client'

import { useEffect, useRef } from 'react'
import type { PlotData, Layout } from 'plotly.js-dist-min'
import { REPORT_COLORS } from '@/lib/report-theme'

interface BarChartProps {
  labels: string[]
  values: number[]
  color?: string
  height?: number
  horizontal?: boolean
  showLabels?: boolean
  labelSuffix?: string
  labelFormatter?: (v: number) => string
  /** Shows a Plotly legend naming this series (e.g. "Priority Score"). Omit for no legend. */
  legendLabel?: string
}

export function BarChart({
  labels,
  values,
  color = REPORT_COLORS.navy,
  height = 300,
  horizontal = false,
  showLabels = false,
  labelSuffix = '',
  labelFormatter,
  legendLabel,
}: BarChartProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || labels.length === 0) return

    const maxLabelLen = horizontal ? Math.max(...labels.map((l) => l.length), 0) : 0
    const leftMargin = horizontal ? Math.min(Math.max(maxLabelLen * 7, 140), 300) : 50

    const labelText = showLabels
      ? values.map((v) =>
          labelFormatter
            ? labelFormatter(v)
            : `${Number.isInteger(v) ? v : v.toFixed(1)}${labelSuffix}`
        )
      : undefined

    const data = [
      {
        type: 'bar',
        x: horizontal ? values : labels,
        y: horizontal ? labels : values,
        orientation: horizontal ? 'h' : 'v',
        marker: { color },
        ...(legendLabel && { name: legendLabel }),
        hovertemplate: horizontal
          ? '%{x:,.0f}<extra></extra>'
          : '%{y:,.0f}<extra></extra>',
        ...(labelText && {
          text: labelText,
          textposition: horizontal ? 'outside' : 'auto',
          insidetextfont: { color: 'white', size: 10 },
          outsidetextfont: { color: '#475569', size: 10 },
          constraintext: 'none',
          cliponaxis: false,
        }),
      },
    ] as unknown as PlotData[]

    // Percentage charts always use a fixed 0-100 scale — Plotly's autorange produces a
    // nonsensical tiny/negative range (e.g. -1 to 1) when every value is 0.
    const isPercent = labelSuffix === '%'
    const percentAxis = isPercent ? { range: [0, 100] as [number, number], autorange: false } : {}

    const layout: Partial<Layout> = {
      height,
      margin: { t: legendLabel ? 36 : 12, r: horizontal && showLabels ? 56 : 20, b: horizontal ? 40 : 56, l: leftMargin },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'var(--font-inter, Inter, system-ui, sans-serif)', size: 11, color: '#64748b' },
      showlegend: !!legendLabel,
      // yanchor: 'bottom' anchors the legend's BOTTOM edge at y=1 (top of the plot area), so the
      // whole legend sits in the margin above the plot instead of drifting down into the first bar.
      legend: { orientation: 'h', x: 0, y: 1, yanchor: 'bottom', font: { size: 10 } },
      xaxis: {
        tickfont: { size: 10 },
        showgrid: !horizontal,
        gridcolor: '#f1f5f9',
        zeroline: false,
        ...(horizontal ? percentAxis : {}),
      },
      yaxis: {
        tickfont: { size: 10 },
        showgrid: horizontal,
        gridcolor: '#f1f5f9',
        zeroline: false,
        automargin: true,
        ...(!horizontal ? percentAxis : {}),
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
  }, [JSON.stringify(labels), JSON.stringify(values), color, height, horizontal, legendLabel])

  return (
    <div ref={ref} style={{ width: '100%', minHeight: height }} className="plotly-chart" />
  )
}
