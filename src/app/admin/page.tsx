'use client'

import { useEffect, useState, useRef } from 'react'
import { Save, RefreshCw, Plus, Building2, Settings, Upload, FileText, CheckCircle, XCircle, Download, PenLine, Trash2 } from 'lucide-react'
import { AlertBadge } from '@/components/ui/AlertBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { loadSignatureSettings, saveSignatureSettings, type SignatureSettings } from '@/lib/signature-settings'

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
  const [yearEditMap, setYearEditMap] = useState<Record<string, { budget: string; staffCount: string }>>({})
  const [yearSaving, setYearSaving] = useState<string | null>(null)
  const [yearSaved, setYearSaved] = useState<string | null>(null)
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
        setYearEditMap({})
        return
      }
      const json = await res.json()
      const data: YearConfig[] = Array.isArray(json) ? json : []
      if (!Array.isArray(json)) console.error('[business-units/yearly] unexpected response', json)
      setYearConfigs(data)
      const initial: Record<string, { budget: string; staffCount: string }> = {}
      // Initialize from existing configs or zero
      units.forEach((u) => {
        const cfg = data.find((c) => c.buName === u.name)
        initial[u.name] = { budget: cfg ? cfg.budget.toString() : '0', staffCount: cfg ? cfg.staffCount.toString() : '0' }
      })
      setYearEditMap(initial)
    } catch {}
  }

  const saveYearConfig = async (buName: string) => {
    setYearSaving(buName)
    try {
      const vals = yearEditMap[buName] ?? { budget: '0', staffCount: '0' }
      await fetch('/api/business-units/yearly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buName, year: selectedYear, budget: parseFloat(vals.budget) || 0, staffCount: parseInt(vals.staffCount) || 0 }),
      })
      setYearSaved(buName)
      setTimeout(() => setYearSaved(null), 2000)
      await loadYearConfigs(selectedYear)
    } finally {
      setYearSaving(null)
    }
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
      // Refresh base units and year configs together so the Annual table updates immediately
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
      const yearInit: Record<string, { budget: string; staffCount: string }> = {}
      freshUnits.forEach((u) => {
        const cfg = freshYearConfigs.find((c) => c.buName === u.name)
        yearInit[u.name] = { budget: cfg ? cfg.budget.toString() : '0', staffCount: cfg ? cfg.staffCount.toString() : '0' }
      })
      setYearConfigs(freshYearConfigs)
      setYearEditMap(yearInit)
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
        )}

        {/* CSV bulk upload */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Upload className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">Bulk Import via CSV / Excel</p>
              <p className="text-xs text-blue-700 mt-0.5">
                Upload a spreadsheet with columns: <strong>Business Unit</strong>, <strong>Staff Count</strong>, <strong>Budget</strong>.
                Select the year this data applies to — values will be saved to the year-specific config.
              </p>
            </div>
          </div>

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

        {/* ── Year-based Budget & Headcount ── */}
        <div className="rounded-xl border border-blue-100 bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Annual Budget & Headcount by Year</p>
              <p className="text-xs text-slate-500 mt-0.5">Set budget and staff count per year for historical accuracy and multi-year analytics.</p>
            </div>
            {/* Year selector */}
            <div className="flex items-center gap-2">
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
          </div>

          {units.length === 0 ? (
            <p className="text-xs text-slate-400">Upload training or subscription data first — business units are auto-detected.</p>
          ) : (
            <div className="space-y-3">
              {units.map((unit) => {
                const vals = yearEditMap[unit.name] ?? { budget: '0', staffCount: '0' }
                const isSaving = yearSaving === unit.name
                const isSaved  = yearSaved  === unit.name
                const existing = yearConfigs.find((c) => c.buName === unit.name)
                const changed = parseFloat(vals.budget) !== (existing?.budget ?? 0) || parseInt(vals.staffCount) !== (existing?.staffCount ?? 0)

                return (
                  <div key={unit.name} className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-blue-500" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700 w-48 shrink-0 truncate">{unit.name}</p>
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Budget {selectedYear} (₦)</label>
                        <input
                          type="number" min="0" value={vals.budget}
                          onChange={(e) => setYearEditMap((p) => ({ ...p, [unit.name]: { ...vals, budget: e.target.value } }))}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Headcount {selectedYear}</label>
                        <input
                          type="number" min="0" value={vals.staffCount}
                          onChange={(e) => setYearEditMap((p) => ({ ...p, [unit.name]: { ...vals, staffCount: e.target.value } }))}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSaved && <span className="text-xs text-green-600 font-medium">Saved</span>}
                      <button
                        onClick={() => saveYearConfig(unit.name)}
                        disabled={isSaving || !changed}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${changed && !isSaving ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      >
                        {isSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Export BU data ── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Download className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Export Business Unit Data</p>
              <p className="text-xs text-slate-500 mt-0.5">Download all configured business units with their budgets and staff counts as a CSV file.</p>
            </div>
            <button
              onClick={async () => {
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
          </div>
        </div>

        {/* ── Signature Settings ── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <PenLine className="w-5 h-5 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">PDF Signature Block</p>
          </div>
          <p className="text-xs text-slate-500">These names and titles appear at the bottom of every exported Business Unit PDF report.</p>
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
