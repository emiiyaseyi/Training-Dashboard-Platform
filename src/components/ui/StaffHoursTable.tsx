'use client'

import React, { useState, useRef } from 'react'
import { ChevronDown, ChevronRight, ShieldCheck, Clock } from 'lucide-react'
import type { StaffHoursRow } from '@/lib/analytics'
import { SectionExport } from './SectionExport'

interface Props {
  staffDetail: StaffHoursRow[]
}

function Badge({ meets }: { meets: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${meets ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
      <ShieldCheck className="w-3 h-3" />
      {meets ? '40h Met' : 'Below 40h'}
    </span>
  )
}

export function StaffHoursTable({ staffDetail }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)

  if (!staffDetail || staffDetail.length === 0) return null

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const meeting40 = staffDetail.filter((s) => s.meets40h)
  const below40   = staffDetail.filter((s) => !s.meets40h)
  const displayed = showAll ? staffDetail : staffDetail.slice(0, 50)

  const exportRows = staffDetail.map((s) => ({
    'Staff ID': s.staffId,
    'Staff Name': s.staffName,
    'Business Unit': s.businessUnit,
    'Training Hours': s.formalHours,
    'KSS Hours': s.kssHours,
    'Total Hours': s.totalHours,
    '40h Compliance': s.meets40h ? 'Met' : 'Below',
    'Trainings Attended': s.trainingItems.map((t) => t.training).join('; '),
  }))

  return (
    <div ref={tableRef}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Staff Learning Hours & 40H Compliance</h2>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            {meeting40.length} met target
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {below40.length} below 40h
          </span>
        </div>
        <SectionExport captureRef={tableRef} rows={exportRows} filename="staff_hours_compliance" label="Export" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-8"></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Staff ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Business Unit</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Training Hrs</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">KSS Hrs</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Total Hrs</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.map((s) => {
              const isOpen = expanded.has(s.staffId)
              const hasDetail = s.trainingItems.length > 0 || s.kssItems.length > 0
              return (
                <React.Fragment key={s.staffId}>
                  <tr
                    className={`hover:bg-slate-50 transition-colors ${isOpen ? 'bg-blue-50/40' : ''}`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      {hasDetail ? (
                        <button onClick={() => toggle(s.staffId)} className="text-slate-400 hover:text-slate-700">
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{s.staffId}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{s.staffName}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs truncate max-w-[180px]">{s.businessUnit}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{s.formalHours > 0 ? `${s.formalHours.toLocaleString()} hrs` : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{s.kssHours > 0 ? `${s.kssHours.toLocaleString()} hrs` : '—'}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${s.meets40h ? 'text-green-700' : 'text-slate-800'}`}>
                      {s.totalHours.toLocaleString()} hrs
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge meets={s.meets40h} />
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isOpen && (
                    <tr className="bg-blue-50/30">
                      <td colSpan={8} className="px-8 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Training items */}
                          {s.trainingItems.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 mb-2">Formal Training</p>
                              <div className="space-y-1">
                                {s.trainingItems.map((t, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs text-slate-600 bg-white rounded-lg px-3 py-1.5 border border-slate-100">
                                    <span className="truncate mr-2">{t.training}</span>
                                    <span className="shrink-0 font-medium text-blue-700">{t.hours} hrs{t.month ? ` · ${t.month}` : ''}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* KSS items */}
                          {s.kssItems.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 mb-2">Knowledge Sharing Sessions (KSS)</p>
                              <div className="space-y-1">
                                {s.kssItems.map((k, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs text-slate-600 bg-white rounded-lg px-3 py-1.5 border border-slate-100">
                                    <span className="text-slate-400">KSS Session{k.month ? ` · ${k.month}` : ''}</span>
                                    <span className="font-medium text-green-700">{k.hours} hrs</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>

        {staffDetail.length > 50 && (
          <div className="px-4 py-3 border-t border-slate-100 text-center">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {showAll ? 'Show fewer' : `Show all ${staffDetail.length} staff`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
