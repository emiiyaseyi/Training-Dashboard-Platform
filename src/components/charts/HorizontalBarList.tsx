interface HorizontalBarListProps {
  labels: string[]
  values: number[]
  color: string
  labelSuffix?: string
  labelFormatter?: (v: number) => string
  maxValue?: number // fixed scale (e.g. 100 for percentages) — defaults to auto based on data
  labelColWidth?: number // px
  barHeight?: number // px
  rowGap?: number // px
}

// Plain CSS bar chart — replaces the Plotly-based horizontal BarChart for cases needing
// flush-left category labels. Plotly's annotation coordinate system for custom label placement
// proved unreliable (labels ended up overlapping bars); percentage-based CSS positioning is
// simple and predictable, so this is deliberately not built on Plotly.
export function HorizontalBarList({
  labels,
  values,
  color,
  labelSuffix = '',
  labelFormatter,
  maxValue,
  labelColWidth = 200,
  barHeight = 20,
  rowGap = 12,
}: HorizontalBarListProps) {
  const dataMax = Math.max(...values, 0)
  const scaleMax = maxValue ?? (dataMax > 0 ? dataMax * 1.15 : 1)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(scaleMax * f * 10) / 10)

  const fmtValue = (v: number) => labelFormatter ? labelFormatter(v) : `${Number.isInteger(v) ? v : v.toFixed(1)}${labelSuffix}`

  return (
    <div className="w-full">
      <div className="flex flex-col" style={{ gap: rowGap }}>
        {labels.map((label, i) => {
          const pct = scaleMax > 0 ? Math.min(100, (values[i] / scaleMax) * 100) : 0
          return (
            <div key={label} className="flex items-center gap-3">
              <div className="text-xs text-report-gray text-left shrink-0 leading-tight" style={{ width: labelColWidth }}>
                {label}
              </div>
              <div className="relative flex-1" style={{ height: barHeight }}>
                <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${pct}%`, backgroundColor: color, minWidth: values[i] > 0 ? 2 : 0 }} />
                <span
                  className="absolute inset-y-0 flex items-center text-xs font-semibold whitespace-nowrap"
                  style={{ left: `calc(${pct}% + 8px)`, color }}
                >
                  {fmtValue(values[i])}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Axis ticks */}
      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-navy-300/40">
        <div className="shrink-0" style={{ width: labelColWidth }} />
        <div className="relative flex-1 h-4">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute text-[10px] text-slate-400"
              style={{
                left: `${(i / (ticks.length - 1)) * 100}%`,
                transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
