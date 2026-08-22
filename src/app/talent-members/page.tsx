'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Users, UserCheck, UserX, UserMinus, Gauge, CalendarCheck, CalendarClock, Pencil, Check, X, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { KPICard } from '@/components/ui/KPICard'
import { DataTable } from '@/components/ui/DataTable'
import { SectionCard } from '@/components/ui/SectionCard'
import { SectionExport } from '@/components/ui/SectionExport'
import { NairaSign } from '@/components/ui/NairaSign'

interface TMAttendedRecord {
  recordId: string | null; source: 'schedule' | 'record'
  staffId: string; staffName: string; businessUnit: string; trainingName: string
  startDate: string; endDate: string; vendor: string | null
}
interface TMUpcomingRecord {
  scheduleId: string; trainingName: string; businessUnit: string
  startDate: string; endDate: string; vendor: string | null; attendeeCount: number
}
interface TMExemptedRecord {
  id: string; staffId: string | null; name: string | null; email: string | null; reason: string | null; resolved: boolean
}
interface TMYetToAttendRecord {
  staffId: string; staffName: string; businessUnit: string; email: string | null
}
interface TalentMemberFullReport {
  year: number
  totalTalentMembers: number
  staffTrained: number
  staffNotTrained: number
  staffExempted: number
  totalSpend: number
  coveragePct: number
  attended: TMAttendedRecord[]
  upcoming: TMUpcomingRecord[]
  exempted: TMExemptedRecord[]
  yetToAttend: TMYetToAttendRecord[]
  unresolvedRosterEntries: { id: string; staffId: string | null; name: string | null; email: string | null }[]
  excludedAttendance: { staffId: string; staffName: string; training: string; month: string }[]
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString()

export default function TalentMembersPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<TalentMemberFullReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null)
  const [vendorDraft, setVendorDraft] = useState('')
  const [savingVendor, setSavingVendor] = useState(false)

  const load = useCallback(async (y: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/talent-members?year=${y}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not load the Talent Members report.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(year) }, [year, load])

  const saveVendor = async (recordId: string) => {
    setSavingVendor(true)
    try {
      const res = await fetch(`/api/admin/training-record/${recordId}/vendor`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor: vendorDraft }),
      })
      if (res.ok) {
        setEditingVendorId(null)
        await load(year)
      } else {
        alert('Failed to save vendor.')
      }
    } finally {
      setSavingVendor(false)
    }
  }

  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i)

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="p-8 space-y-4">
      <AlertBadge variant="error" message={error} />
      <button onClick={() => load(year)} className="text-sm text-blue-600 flex items-center gap-1.5">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  )

  if (!data) return null

  const attendedRows = data.attended.map((a) => ({
    'Staff ID': a.staffId, Name: a.staffName, 'Business Unit': a.businessUnit,
    Training: a.trainingName, 'Start Date': fmtDate(a.startDate), 'End Date': fmtDate(a.endDate),
    Vendor: a.vendor || '',
  }))
  const upcomingRows = data.upcoming.map((u) => ({
    Training: u.trainingName, 'Business Unit': u.businessUnit,
    'Start Date': fmtDate(u.startDate), 'End Date': fmtDate(u.endDate),
    Vendor: u.vendor || '', Attendees: u.attendeeCount,
  }))
  const exemptedRows = data.exempted.map((e) => ({
    Name: e.name || '', 'Staff ID': e.staffId || '', Email: e.email || '',
    Reason: e.reason || '', 'Matched Current TM': e.resolved ? 'Yes' : 'No',
  }))
  const yetToAttendRows = data.yetToAttend.map((s) => ({
    'Staff ID': s.staffId, Name: s.staffName, 'Business Unit': s.businessUnit, Email: s.email || '',
  }))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Talent Members"
        subtitle="TM Trainings roster, completion, and coverage for the year in review"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableYears.map((y) => <option key={y} value={y}>{y}{y === currentYear ? ' (current)' : ''}</option>)}
            </select>
            <SectionExport
              sheets={[
                { name: 'Attended', rows: attendedRows },
                { name: 'Upcoming', rows: upcomingRows },
                { name: 'Exempted', rows: exemptedRows },
                { name: 'Yet to Attend', rows: yetToAttendRows },
              ]}
              filename={`talent_members_${year}`}
              format="xlsx"
              label="Download All"
            />
            <button onClick={() => load(year)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard title="Total Talent Members" value={data.totalTalentMembers.toLocaleString()} subtitle="Current TM roster" icon={Users} color="blue" />
          <KPICard title="Staff Trained" value={data.staffTrained.toLocaleString()} subtitle={`${year} TM training attendance`} icon={UserCheck} color="green" />
          <KPICard title="Yet to be Trained" value={data.staffNotTrained.toLocaleString()} subtitle="Not yet attended, not exempted" icon={UserX} color="red" alert={data.staffNotTrained > 0} />
          <KPICard title="Staff Exempted" value={data.staffExempted.toLocaleString()} subtitle={`Excused for ${year}`} icon={UserMinus} color="purple" />
          <KPICard title="Total Spend" value={`₦${data.totalSpend.toLocaleString()}`} subtitle="TM trainings attended this year" icon={NairaSign} color="amber" />
          <KPICard title="TM Coverage" value={`${data.coveragePct.toFixed(1)}%`} subtitle="Trained ÷ (Total − Exempted)" icon={Gauge} color={data.coveragePct >= 70 ? 'green' : data.coveragePct >= 40 ? 'amber' : 'red'} />
        </div>

        {data.unresolvedRosterEntries.length > 0 && (
          <AlertBadge
            variant="warning"
            message={`${data.unresolvedRosterEntries.length} roster ${data.unresolvedRosterEntries.length === 1 ? 'entry doesn\'t' : 'entries don\'t'} match a current staff member yet (${data.unresolvedRosterEntries.map((e) => e.name || e.staffId || e.email).join(', ')}) — they won't count toward the totals above until they resolve. Check spelling under Admin → Talent Member Roster, or that they're on the uploaded Staff Roster.`}
          />
        )}

        {data.totalTalentMembers === 0 && (
          <AlertBadge
            variant="info"
            message="No Talent Members on the roster yet — add them under Admin → Talent Member Roster."
          />
        )}

        {data.excludedAttendance.length > 0 && (
          <AlertBadge
            variant="warning"
            message={`${data.excludedAttendance.length} row${data.excludedAttendance.length === 1 ? '' : 's'} in the 2026 Training Data tagged Training Type = TM didn't count toward Staff Trained because the Staff ID doesn't match anyone currently on the TM roster: ${data.excludedAttendance.map((e) => `${e.staffName} (${e.staffId}) — ${e.training}`).join('; ')}.`}
          />
        )}

        <SectionCard
          icon={CalendarCheck}
          title={`TMs That Attended a Training (${data.attended.length})`}
          description="Sourced from the 2026 Training Data (Training Type = TM) and from scheduled TM trainings whose end date has passed. Month-only entries (no vendor) come from the Training Data sheet."
          headerActions={<SectionExport rows={attendedRows} filename={`tm_attended_${year}`} format="xlsx" label="Excel" />}
        >
          <DataTable
            columns={[
              { key: 'staffName', header: 'Name' },
              { key: 'staffId', header: 'Staff ID' },
              { key: 'businessUnit', header: 'Business Unit' },
              { key: 'trainingName', header: 'Training' },
              { key: 'startDate', header: 'Start', render: (r) => fmtDate(r.startDate as string) },
              { key: 'endDate', header: 'End', render: (r) => fmtDate(r.endDate as string) },
              {
                key: 'vendor', header: 'Vendor',
                render: (r) => {
                  const row = r as unknown as TMAttendedRecord
                  if (row.source !== 'record' || !row.recordId) return row.vendor || '—'
                  if (editingVendorId === row.recordId) {
                    return (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={vendorDraft}
                          onChange={(e) => setVendorDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveVendor(row.recordId!) }}
                          className="text-xs border border-slate-300 rounded px-2 py-1 w-32"
                        />
                        <button onClick={() => saveVendor(row.recordId!)} disabled={savingVendor} className="text-emerald-600 hover:text-emerald-800">
                          {savingVendor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setEditingVendorId(null)} className="text-slate-400 hover:text-red-600">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  }
                  return (
                    <button
                      onClick={() => { setEditingVendorId(row.recordId); setVendorDraft(row.vendor || '') }}
                      className="flex items-center gap-1 text-slate-600 hover:text-blue-600 group"
                    >
                      {row.vendor || <span className="text-slate-400">—</span>}
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                    </button>
                  )
                },
              },
            ]}
            data={data.attended as unknown as Record<string, unknown>[]}
            emptyMessage="No TM training attendance recorded yet."
          />
        </SectionCard>

        <SectionCard
          icon={CalendarClock}
          title={`TM Trainings Coming Up (${data.upcoming.length})`}
          description="Scheduled TM trainings that haven't happened yet."
          headerActions={<SectionExport rows={upcomingRows} filename={`tm_upcoming_${year}`} format="xlsx" label="Excel" />}
        >
          <DataTable
            columns={[
              { key: 'trainingName', header: 'Training' },
              { key: 'businessUnit', header: 'Business Unit' },
              { key: 'startDate', header: 'Start', render: (r) => fmtDate(r.startDate as string) },
              { key: 'endDate', header: 'End', render: (r) => fmtDate(r.endDate as string) },
              { key: 'vendor', header: 'Vendor', render: (r) => (r.vendor as string) || '—' },
              { key: 'attendeeCount', header: 'Attendees', align: 'right' },
            ]}
            data={data.upcoming as unknown as Record<string, unknown>[]}
            emptyMessage="No upcoming TM trainings scheduled."
          />
        </SectionCard>

        <SectionCard
          icon={UserMinus}
          title={`TMs Exempted in ${year} (${data.exempted.length})`}
          description="Managed under Admin → Talent Member (TM) Exemptions."
          headerActions={<SectionExport rows={exemptedRows} filename={`tm_exempted_${year}`} format="xlsx" label="Excel" />}
        >
          <DataTable
            columns={[
              { key: 'name', header: 'Name', render: (r) => (r.name as string) || '—' },
              { key: 'staffId', header: 'Staff ID', render: (r) => (r.staffId as string) || '—' },
              { key: 'email', header: 'Email', render: (r) => (r.email as string) || '—' },
              { key: 'reason', header: 'Reason', render: (r) => (r.reason as string) || '—' },
              {
                key: 'resolved', header: 'Matched Current TM', align: 'center',
                render: (r) => (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.resolved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {r.resolved ? 'Yes' : 'Not found'}
                  </span>
                ),
              },
            ]}
            data={data.exempted as unknown as Record<string, unknown>[]}
            emptyMessage={`No exemptions recorded for ${year}.`}
          />
        </SectionCard>

        <SectionCard
          icon={UserX}
          title={`Staff Yet to Attend (${data.yetToAttend.length})`}
          description="Talent Members with no TM training attendance recorded and no exemption on file."
          headerActions={<SectionExport rows={yetToAttendRows} filename={`tm_yet_to_attend_${year}`} format="xlsx" label="Excel" />}
        >
          <DataTable
            columns={[
              { key: 'staffName', header: 'Name' },
              { key: 'staffId', header: 'Staff ID' },
              { key: 'businessUnit', header: 'Business Unit' },
              { key: 'email', header: 'Email', render: (r) => (r.email as string) || '—' },
            ]}
            data={data.yetToAttend as unknown as Record<string, unknown>[]}
            emptyMessage="Everyone on the TM roster has either attended or been exempted."
          />
        </SectionCard>
      </div>
    </div>
  )
}
