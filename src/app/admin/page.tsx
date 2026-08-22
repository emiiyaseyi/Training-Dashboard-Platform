'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Save, RefreshCw, Plus, Building2, Settings, Upload, FileText, CheckCircle, XCircle, Download, PenLine, Trash2, Users, ChevronRight, Mail } from 'lucide-react'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { loadSignatureSettings, saveSignatureSettings, type SignatureSettings } from '@/lib/signature-settings'
import { TaxonomyPanel } from '@/components/admin/TaxonomyPanel'
import { GroupCostDistribution } from '@/components/admin/GroupCostDistribution'
import { TalentMemberExemptionPanel } from '@/components/admin/TalentMemberExemptionPanel'
import { TalentMemberRosterPanel } from '@/components/admin/TalentMemberRosterPanel'
import { BudgetSettingsPanel } from '@/components/admin/BudgetSettingsPanel'
import { GoogleSheetsPanel } from '@/components/admin/GoogleSheetsPanel'
import { DataQualityAudit } from '@/components/admin/DataQualityAudit'
import { StaffDataQuality } from '@/components/admin/StaffDataQuality'
import { SmtpSettingsPanel } from '@/components/admin/SmtpSettingsPanel'

interface BU {
  id: string
  name: string
  budget: number
  staffCount: number
}

function fmt(n: number) {
  return n.toLocaleString()
}

interface CSVRow { name: string; staffCount: number; budget: number }
interface CSVImportResult { imported: number; skipped: number; errors: string[] }
interface YearConfig { id: string; buName: string; year: number; budget: number; staffCount: number }

export default function AdminPage() {
  const [units, setUnits] = useState<BU[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [newBU, setNewBU] = useState({ name: '', budget: '', staffCount: '' })
  const [addingNew, setAddingNew] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [editMap, setEditMap] = useState<Record<string, { budget: string; staffCount: string }>>({})
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<CSVImportResult | null>(null)
  const [csvYear, setCsvYear] = useState(new Date().getFullYear())
  const csvRef = useRef<HTMLInputElement>(null)
  const [sig, setSig] = useState<SignatureSettings>(() => loadSignatureSettings())
  const [sigSaved, setSigSaved] = useState(false)

  // Year-based config
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [yearConfigs, setYearConfigs] = useState<YearConfig[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  const availableYears = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i) // 2 past + current + 3 future

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/business-units')
      if (!res.ok) {
        console.error(`[business-units] HTTP ${res.status}`, await res.json().catch(() => res.statusText))
        setUnits([])
        setEditMap({})
        return
      }
      const json = await res.json()
      const data: BU[] = Array.isArray(json) ? json : []
      if (!Array.isArray(json)) console.error('[business-units] unexpected response', json)
      setUnits(data)
      const initial: Record<string, { budget: string; staffCount: string }> = {}
      data.forEach((u) => {
        initial[u.id] = { budget: u.budget.toString(), staffCount: u.staffCount.toString() }
      })
      setEditMap(initial)
    } finally {
      setLoading(false)
    }
  }

  const loadYearConfigs = async (year: number) => {
    try {
      const res = await fetch(`/api/business-units/yearly?year=${year}`)
      if (!res.ok) {
        console.error(`[business-units/yearly] HTTP ${res.status}`, await res.json().catch(() => res.statusText))
        setYearConfigs([])
        return
      }
      const json = await res.json()
      const data: YearConfig[] = Array.isArray(json) ? json : []
      if (!Array.isArray(json)) console.error('[business-units/yearly] unexpected response', json)
      setYearConfigs(data)
    } catch {}
  }

  useEffect(() => { load() }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (units.length > 0) loadYearConfigs(selectedYear) }, [selectedYear, units.length])

  const save = async (unit: BU) => {
    setSaving(unit.id)
    try {
      const vals = editMap[unit.id] ?? { budget: '0', staffCount: '0' }
      await fetch('/api/business-units', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: unit.id,
          budget: parseFloat(vals.budget) || 0,
          staffCount: parseInt(vals.staffCount) || 0,
        }),
      })
      setSaved(unit.id)
      setTimeout(() => setSaved(null), 2000)
      await load()
    } finally {
      setSaving(null)
    }
  }

  const addBU = async () => {
    if (!newBU.name.trim()) return
    setAddSaving(true)
    try {
      await fetch('/api/business-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBU.name.trim(),
          budget: parseFloat(newBU.budget) || 0,
          staffCount: parseInt(newBU.staffCount) || 0,
        }),
      })
      setNewBU({ name: '', budget: '', staffCount: '' })
      setAddingNew(false)
      await load()
    } finally {
      setAddSaving(false)
    }
  }

  const deleteBU = async (unit: BU) => {
    if (!confirm(`Delete "${unit.name}"? This cannot be undone.`)) return
    setDeleting(unit.id)
    try {
      await fetch('/api/business-units', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: unit.id }),
      })
      await load()
    } finally {
      setDeleting(null)
    }
  }

  const handleCSVImport = async (file: File) => {
    setCsvImporting(true)
    setCsvResult(null)
    try {
      const buffer = await file.arrayBuffer()
      const XLSXmod = await import('xlsx')
      const XLSX = XLSXmod.default ?? XLSXmod
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })

      const parsed: CSVRow[] = []
      const errors: string[] = []

      rows.forEach((r, i) => {
        const keys = Object.keys(r).map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ''))
        const getVal = (candidates: string[]) => {
          for (const c of candidates) {
            const idx = keys.indexOf(c)
            if (idx !== -1) return Object.values(r)[idx]
          }
          return ''
        }
        const name = String(getVal(['businessunit', 'businessunits', 'unit', 'department', 'bu', 'name']) ?? '').trim()
        const staffCountRaw = parseFloat(String(getVal(['staffcount', 'staff', 'headcount', 'employees', 'totalstaff']) ?? '0').replace(/[^0-9.]/g, ''))
        const budgetRaw = parseFloat(String(getVal(['budget', 'annualbudget', 'trainingbudget', 'amount']) ?? '0').replace(/[^0-9.]/g, ''))

        if (!name) { errors.push(`Row ${i + 2}: Business Unit name missing — skipped.`); return }
        parsed.push({ name, staffCount: isNaN(staffCountRaw) ? 0 : staffCountRaw, budget: isNaN(budgetRaw) ? 0 : budgetRaw })
      })

      // Ensure base BusinessUnit records exist first
      for (const row of parsed) {
        await fetch('/api/business-units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: row.name, budget: row.budget, staffCount: row.staffCount }),
        })
      }
      // Upsert into year-specific config
      let imported = 0
      for (const row of parsed) {
        await fetch('/api/business-units/yearly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buName: row.name, year: csvYear, budget: row.budget, staffCount: row.staffCount }),
        })
        imported++
      }

      setCsvResult({ imported, skipped: errors.length, errors })
      // Refresh base units and year configs together
      const [freshUnitsRes, freshYearRes] = await Promise.all([
        fetch('/api/business-units'),
        fetch(`/api/business-units/yearly?year=${csvYear}`),
      ])
      const freshUnits: BU[] = await freshUnitsRes.json().catch(() => [])
      const freshYearConfigs: YearConfig[] = await freshYearRes.json().catch(() => [])
      setUnits(freshUnits)
      const editInit: Record<string, { budget: string; staffCount: string }> = {}
      freshUnits.forEach((u) => { editInit[u.id] = { budget: u.budget.toString(), staffCount: u.staffCount.toString() } })
      setEditMap(editInit)
      setYearConfigs(freshYearConfigs)
      setSelectedYear(csvYear)
    } catch {
      setCsvResult({ imported: 0, skipped: 0, errors: ['Failed to parse file. Please check the format.'] })
    } finally {
      setCsvImporting(false)
      if (csvRef.current) csvRef.current.value = ''
    }
  }

  const updateEdit = (id: string, field: 'budget' | 'staffCount', value: string) => {
    setEditMap((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { budget: '0', staffCount: '0' }), [field]: value },
    }))
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Admin Settings"
        subtitle="Configure business unit budgets and staff counts"
        actions={
          <button onClick={load} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        }
      />

      <div className="p-8 space-y-8">
        {/* Guide */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Configuration Guide</p>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Set the approved annual training budget and total headcount for each business unit. These values power the budget utilisation,
                coverage ratio, and forecasting calculations across all dashboards. Business Units are auto-created when data is uploaded —
                set their values here.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <SectionCard
            icon={Building2}
            title="Annual Budget & Headcount by Year"
            description="Set budget and staff count per year for historical accuracy and multi-year analytics."
            headerActions={
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <label className="text-xs font-medium text-slate-600">Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>{y}{y === currentYear ? ' (current)' : ''}</option>
                  ))}
                </select>
              </div>
            }
          >
          <div className="space-y-4">
            {units.length === 0 && (
              <AlertBadge
                variant="info"
                message="No business units found. Upload training or subscription data first — business units are auto-detected from your data."
              />
            )}

            {units.map((unit) => {
              const vals = editMap[unit.id] ?? { budget: '0', staffCount: '0' }
              const isSaving = saving === unit.id
              const isSaved = saved === unit.id
              const budget = parseFloat(vals.budget) || 0
              const staffCount = parseInt(vals.staffCount) || 0
              const changed = budget !== unit.budget || staffCount !== unit.staffCount

              return (
                <div key={unit.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Building2 className="w-4.5 h-4.5 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{unit.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Current: Budget ₦{fmt(unit.budget)} · Staff {unit.staffCount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSaved && <span className="text-xs text-green-600 font-medium">Saved</span>}
                      <button
                        onClick={() => save(unit)}
                        disabled={isSaving || !changed}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                          changed && !isSaving
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {isSaving ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Save
                      </button>
                      <button
                        onClick={() => deleteBU(unit)}
                        disabled={deleting === unit.id}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-40"
                        title="Delete this business unit"
                      >
                        {deleting === unit.id
                          ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Annual Training Budget (₦)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={vals.budget}
                        onChange={(e) => updateEdit(unit.id, 'budget', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent tabular-nums"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Total Headcount (Staff)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={vals.staffCount}
                        onChange={(e) => updateEdit(unit.id, 'staffCount', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent tabular-nums"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Add new BU */}
            {!addingNew ? (
              <button
                onClick={() => setAddingNew(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                Add Business Unit Manually
              </button>
            ) : (
              <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-4">
                <p className="text-sm font-semibold text-slate-800">Add Business Unit</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                    <input
                      type="text"
                      value={newBU.name}
                      onChange={(e) => setNewBU((p) => ({ ...p, name: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Risk Management"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Budget (₦)</label>
                    <input
                      type="number"
                      min="0"
                      value={newBU.budget}
                      onChange={(e) => setNewBU((p) => ({ ...p, budget: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Staff Count</label>
                    <input
                      type="number"
                      min="0"
                      value={newBU.staffCount}
                      onChange={(e) => setNewBU((p) => ({ ...p, staffCount: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={addBU}
                    disabled={!newBU.name.trim() || addSaving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {addSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add Unit
                  </button>
                  <button onClick={() => setAddingNew(false)} className="text-sm text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          </SectionCard>
        )}

        {/* CSV bulk upload */}
        <SectionCard
          icon={Upload}
          title="Bulk Import via CSV / Excel"
          accentClassName="border-blue-100 bg-blue-50"
          description={
            <>Upload a spreadsheet with columns: <strong>Business Unit</strong>, <strong>Staff Count</strong>, <strong>Budget</strong>. Select the year this data applies to — values will be saved to the year-specific config.</>
          }
        >
          <div className="space-y-4">

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-blue-800">Year:</label>
              <select
                value={csvYear}
                onChange={(e) => setCsvYear(parseInt(e.target.value))}
                className="text-sm border border-blue-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}{y === currentYear ? ' (current)' : ''}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => csvRef.current?.click()}
              disabled={csvImporting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {csvImporting
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <FileText className="w-4 h-4" />}
              {csvImporting ? 'Importing…' : 'Choose File'}
            </button>
            <p className="text-xs text-blue-600">.csv, .xlsx, or .xls accepted</p>
            <input
              ref={csvRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCSVImport(f) }}
            />
          </div>

          {/* Sample format */}
          <div className="rounded-lg bg-white border border-blue-100 p-3 overflow-x-auto">
            <p className="text-xs font-semibold text-slate-600 mb-2">Sample file format:</p>
            <table className="text-xs text-slate-600 w-full">
              <thead><tr className="border-b border-slate-100">{['Business Unit','Staff Count','Budget'].map((h) => <th key={h} className="text-left py-1 pr-6 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                <tr><td className="py-1 pr-6">Meristem Securities Limited</td><td className="py-1 pr-6">45</td><td>15000000</td></tr>
                <tr><td className="py-1 pr-6">Meristem Stockbrokers Limited</td><td className="py-1 pr-6">30</td><td>10000000</td></tr>
              </tbody>
            </table>
          </div>

          {/* Import result */}
          {csvResult && (
            <div className={`rounded-lg border p-3 space-y-1 ${csvResult.errors.length > 0 && csvResult.imported === 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-center gap-2">
                {csvResult.imported > 0
                  ? <CheckCircle className="w-4 h-4 text-green-600" />
                  : <XCircle className="w-4 h-4 text-red-500" />}
                <p className="text-sm font-medium text-slate-800">
                  {csvResult.imported} business unit{csvResult.imported !== 1 ? 's' : ''} imported for {csvYear}
                  {csvResult.skipped > 0 && `, ${csvResult.skipped} row${csvResult.skipped !== 1 ? 's' : ''} skipped`}
                </p>
              </div>
              {csvResult.errors.map((e, i) => <p key={i} className="text-xs text-red-700 ml-6">• {e}</p>)}
            </div>
          )}
          </div>
        </SectionCard>

        {/* ── Export BU data ── */}
        <SectionCard
          icon={Download}
          title="Export Business Unit Data"
          description="Download all configured business units with their budgets and staff counts as a CSV file."
          headerActions={
            <button
              onClick={async (e) => {
                e.stopPropagation()
                const XLSXmod = await import('xlsx')
                const XLSX = XLSXmod.default ?? XLSXmod
                const rows = units.map((u) => ({
                  'Business Unit': u.name,
                  'Staff Count': u.staffCount,
                  'Annual Budget (₦)': u.budget,
                }))
                const wb = XLSX.utils.book_new()
                const ws = XLSX.utils.json_to_sheet(rows)
                ws['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 20 }]
                XLSX.utils.book_append_sheet(wb, ws, 'Business Units')
                XLSX.writeFile(wb, `Business_Units_${new Date().toISOString().slice(0, 10)}.csv`, { bookType: 'csv' })
              }}
              disabled={units.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          }
        >
          <p className="text-xs text-slate-400">{units.length === 0 ? 'No business units configured yet.' : `${units.length} business unit${units.length === 1 ? '' : 's'} ready to export.`}</p>
        </SectionCard>

        {/* ── Signature Settings ── */}
        <SectionCard
          icon={PenLine}
          title="PDF Signature Block"
          description="These names and titles appear at the bottom of every exported Business Unit PDF report."
        >
          <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Primary Signer Title</label>
              <input type="text" value={sig.primaryTitle} onChange={(e) => setSig((p) => ({ ...p, primaryTitle: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Head, Learning & Development" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Primary Signer Name <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="text" value={sig.primaryName} onChange={(e) => setSig((p) => ({ ...p, primaryName: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Secondary Signer Title <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="text" value={sig.secondaryTitle} onChange={(e) => setSig((p) => ({ ...p, secondaryTitle: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Business Unit Head" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Secondary Signer Name <span className="text-slate-400 font-normal">(optional)</span></label>
              <input type="text" value={sig.secondaryName} onChange={(e) => setSig((p) => ({ ...p, secondaryName: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Full name" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Organisation Line <span className="text-slate-400 font-normal">(appears at the foot of the signature block)</span></label>
            <input type="text" value={sig.organisationLine} onChange={(e) => setSig((p) => ({ ...p, organisationLine: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Meristem Learning & Development" />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { saveSignatureSettings(sig); setSigSaved(true); setTimeout(() => setSigSaved(false), 2500) }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save Signature Settings
            </button>
            {sigSaved && <span className="text-xs text-green-600 font-medium">Saved — will appear on next PDF export.</span>}
          </div>
          </div>
        </SectionCard>

        {/* Training Type & Differentiating Capability taxonomies */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TaxonomyPanel
            title="Training Types"
            description="Classifies training spend as Formal Training (Internal/External) or a Strategic Learning Initiative (Summit, Leadership Cafe, Workshop, etc.). This drives the split shown on the Total Learning Investment and Strategic Learning Initiatives cards, and populates the Training Type column on the upload template."
            endpoint="/api/training-types"
            withClassification
            namePlaceholder="e.g. Summit"
          />
          <TaxonomyPanel
            title="Differentiating Capabilities"
            description="The set of capabilities tracked for coverage reporting. Tag training records against these via the Capability column on upload — coverage is the % of total staff trained per capability."
            endpoint="/api/capabilities"
            namePlaceholder="e.g. Risk Management"
          />
          <TaxonomyPanel
            title="Vendors"
            description="Training vendors/facilitators, selectable when creating a Training Schedule. Used by the Talent Members report to show which vendor ran each TM training."
            endpoint="/api/vendors"
            namePlaceholder="e.g. Lagos Business School"
          />
        </div>

        {/* User access & permissions */}
        <Link
          href="/admin/users"
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white shadow-sm p-5 hover:border-navy-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-800">User Access</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage who can sign in, which pages they see, and their permission level per page.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-navy-500 shrink-0" />
        </Link>

        {/* Survey automation */}
        <Link
          href="/admin/surveys"
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white shadow-sm p-5 hover:border-navy-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Survey Automation</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Training schedules, survey questions, and pre/post-training survey email triggers.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-navy-500 shrink-0" />
        </Link>

        {/* SMTP / email settings — platform-wide, used by Survey Automation and beyond */}
        <SmtpSettingsPanel />

        {/* Data quality audit */}
        <DataQualityAudit />

        {/* Staff roster quality: missing fields, duplicates, inline edit */}
        <StaffDataQuality />

        {/* Live Google Sheets data source */}
        <GoogleSheetsPanel />

        {/* Budget calculation settings */}
        <BudgetSettingsPanel />

        {/* Talent Member (TM) roster — who counts as a TM at all; admin-only, not shown on the (wider-audience) Talent Members report page */}
        <TalentMemberRosterPanel onChanged={() => {}} />

        {/* Talent Member (TM) exemptions — staff excused from this year's TM Trainings requirement */}
        <TalentMemberExemptionPanel />

        {/* Other Investment Budget — group training cost distribution */}
        <GroupCostDistribution />

        {/* Info box */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-700 mb-2">How analytics use these values</p>
          <ul className="space-y-1.5 text-sm text-slate-500">
            <li>• <strong className="text-slate-700">Budget</strong> powers budget utilisation, overspend alerts, and annual forecasting.</li>
            <li>• <strong className="text-slate-700">Staff Count</strong> powers coverage ratio (how much of the team is being trained).</li>
            <li>• <strong className="text-slate-700">Investment per Staff</strong> is calculated group-wide using total headcount.</li>
            <li>• Business Units without budgets are shown as &quot;Not set&quot; in dashboards — no alerts are triggered.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
