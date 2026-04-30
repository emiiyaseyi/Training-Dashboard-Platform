'use client'

import { useRef } from 'react'
import { SectionExport, type SectionExportProps } from './SectionExport'

interface ChartCardProps
  extends Omit<SectionExportProps, 'captureRef'> {
  title: string
  children: React.ReactNode
  className?: string
}

export function ChartCard({ title, children, className = '', ...exportProps }: ChartCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={cardRef} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <SectionExport
          captureRef={cardRef}
          {...exportProps}
        />
      </div>
      {children}
    </div>
  )
}
