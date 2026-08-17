interface SlideShellProps {
  title: string
  subtitle: string
  pageNumber: number
  periodLabel: string
  children: React.ReactNode
}

// Fixed 16:9 canvas matching the source report deck — org footer, page number, serif headline.
// This is also the exact frame captured for PNG export and mirrored 1:1 by the PPTX export engine.
export function SlideShell({ title, subtitle, pageNumber, periodLabel, children }: SlideShellProps) {
  return (
    <div className="bg-white w-full h-full flex flex-col overflow-hidden" style={{ padding: 40 }}>
      <div className="shrink-0" style={{ marginBottom: 18 }}>
        <h1 className="font-serif font-bold text-navy-600" style={{ fontSize: 34, lineHeight: '40px' }}>{title}</h1>
        <p className="text-report-gray" style={{ fontSize: 16, marginTop: 3 }}>{subtitle}</p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>

      <div className="flex items-center justify-between text-report-gray shrink-0" style={{ paddingTop: 10, marginTop: 12, borderTop: '1px solid #CADCFC', fontSize: 12 }}>
        <span>Meristem Group&nbsp;&nbsp;|&nbsp;&nbsp;Learning &amp; Development Investment Report&nbsp;&nbsp;|&nbsp;&nbsp;{periodLabel}</span>
        <span>{pageNumber}</span>
      </div>
    </div>
  )
}
