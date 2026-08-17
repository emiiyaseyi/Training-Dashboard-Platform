declare module 'plotly.js-dist-min' {
  interface PlotlyHTMLElement extends HTMLElement {
    data: PlotData[]
    layout: Partial<Layout>
    config: Partial<Config>
  }

  interface PlotData {
    type?: string
    x?: unknown[]
    y?: unknown[]
    text?: string | string[]
    mode?: string
    marker?: Record<string, unknown>
    line?: Record<string, unknown>
    fill?: string
    fillcolor?: string
    hole?: number
    labels?: string[]
    values?: number[]
    textinfo?: string
    hovertemplate?: string
    textposition?: string
    orientation?: 'h' | 'v'
    colorscale?: unknown
    showscale?: boolean
    cliponaxis?: boolean
    insidetextfont?: Record<string, unknown>
    outsidetextfont?: Record<string, unknown>
    constraintext?: string
  }

  interface Axis {
    title?: { text?: string; font?: Record<string, unknown> }
    showgrid?: boolean
    gridcolor?: string
    zeroline?: boolean
    tickfont?: Record<string, unknown>
    automargin?: boolean
    range?: [number, number]
    autorange?: boolean
    tickformat?: string
    showticklabels?: boolean
  }

  interface Annotation {
    xref?: 'paper' | 'x'
    yref?: 'paper' | 'y'
    x?: number | string
    y?: number | string
    xanchor?: 'left' | 'center' | 'right'
    yanchor?: 'top' | 'middle' | 'bottom'
    xshift?: number
    yshift?: number
    text?: string
    showarrow?: boolean
    font?: Record<string, unknown>
  }

  interface Layout {
    height?: number
    width?: number
    margin?: { t?: number; r?: number; b?: number; l?: number }
    paper_bgcolor?: string
    plot_bgcolor?: string
    font?: { family?: string; size?: number; color?: string }
    showlegend?: boolean
    legend?: Record<string, unknown>
    xaxis?: Axis
    yaxis?: Axis
    bargap?: number
    title?: { text?: string; font?: Record<string, unknown> }
    annotations?: Annotation[]
  }

  interface Config {
    responsive?: boolean
    displayModeBar?: boolean
    displaylogo?: boolean
    modeBarButtonsToRemove?: string[]
  }

  function react(
    root: HTMLElement,
    data: PlotData[],
    layout?: Partial<Layout>,
    config?: Partial<Config>,
  ): Promise<PlotlyHTMLElement>

  function newPlot(
    root: HTMLElement,
    data: PlotData[],
    layout?: Partial<Layout>,
    config?: Partial<Config>,
  ): Promise<PlotlyHTMLElement>

  function purge(root: HTMLElement): void
}
