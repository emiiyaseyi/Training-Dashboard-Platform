'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Trash2, Save, Loader2, X, Pencil, Users, Download, Upload } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import { NairaSign } from '@/components/ui/NairaSign'

interface SubscriptionRow {
  id: string
  staffId: string
  staffName: string
  businessUnit: string
  membershipOrg: string
  amount: number
  category: string
  month: string | null
}

const CATEGORY_LABELS: Record<string, string> = { membership: 'Membership Subscription', certification: 'Certification Refund' }

interface RosterStaff {
  staffId: string
  name: string
  email: string | null
  businessUnit: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function SubscriptionRecordsTab() {
  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ staffName: string; businessUnit: string; membershipOrg: string; amount: string; month: string; category: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [addingNew, setAddingNew] = useState(false)
  const [directory, setDirectory] = useState<RosterStaff[]>([])
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickedStaff, setPickedStaff] = useState<RosterStaff | null>(null)
  const [newOrg, setNewOrg] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newMonth, setNewMonth] = useState(MONTHS[new Date().getMonth()])
  const [newCategory, setNewCategory] = useState('membership')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkOrg, setBulkOrg] = useState('')
  const [bulkMonth, setBulkMonth] = useState(MONTHS[new Date().getMonth()])
  const [bulkCategory, setBulkCategory] = useState('membership')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ added: number; notFound: string[]; invalid: string[] } | null>(null)
  const bulkCsvRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/records/subscriptions?search=${encodeURIComponent(query)}&page=${page}`)
      const data = await res.json()
      setRows(data.rows || [])
      setTotal(data.total || 0)
      setPageSize(data.pageSize || 20)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 300)
    return () => clearTimeout(t)
  }, [page, query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/admin/roster-directory').then((r) => r.json()).then((d) => setDirectory(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return []
    return directory.filter((s) => s.name.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)).slice(0, 8)
  }, [pickerQuery, directory])

  const startEdit = (r: SubscriptionRow) => {
    setEditingId(r.id)
    setDraft({ staffName: r.staffName, businessUnit: r.businessUnit, membershipOrg: r.membershipOrg, amount: String(r.amount), month: r.month || '', category: r.category || 'membership' })
  }

  const saveEdit = async (r: SubscriptionRow) => {
    if (!draft) return
    setSaving(true)
    try {
      const newAmount = parseFloat(draft.amount) || 0
      const changedIdentity = {
        membershipOrg: draft.membershipOrg.trim() !== r.membershipOrg ? draft.membershipOrg.trim() : undefined,
        amount: newAmount !== r.amount ? newAmount : undefined,
      }
      const changes = Object.fromEntries(Object.entries(changedIdentity).filter(([, v]) => v !== undefined))

      const res = await fetch(`/api/admin/records/subscriptions/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffName: draft.staffName, businessUnit: draft.businessUnit, membershipOrg: draft.membershipOrg,
          amount: newAmount, month: draft.month || null, category: draft.category,
        }),
      })
      if (!res.ok) { alert('Failed to save.'); return }

      setEditingId(null); setDraft(null)

      if (Object.keys(changes).length > 0) {
        const fieldNames = Object.keys(changes).join(', ')
        if (confirm(`Apply this ${fieldNames} change to every other subscription record under "${r.membershipOrg}" too?`)) {
          const applyRes = await fetch('/api/admin/records/subscriptions/apply-to-similar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ originalMembershipOrg: r.membershipOrg, excludeId: r.id, changes }),
          })
          const applyData = await applyRes.json().catch(() => ({}))
          if (applyRes.ok) alert(`Applied to ${applyData.updated} other record${applyData.updated === 1 ? '' : 's'}.`)
        }
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this subscription record? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await fetch(`/api/admin/records/subscriptions/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  const addRecord = async () => {
    if (!pickedStaff || !newOrg.trim() || !newAmount) return
    setAddSaving(true)
    setAddError('')
    try {
      const res = await fetch('/api/admin/records/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: pickedStaff.staffId, staffName: pickedStaff.name, businessUnit: pickedStaff.businessUnit,
          membershipOrg: newOrg.trim(), amount: parseFloat(newAmount) || 0, month: newMonth, category: newCategory,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setAddingNew(false); setPickedStaff(null); setPickerQuery(''); setNewOrg(''); setNewAmount(''); setNewCategory('membership')
        setPage(1); await load()
      } else {
        setAddError(data.error || 'Failed to add record.')
      }
    } finally {
      setAddSaving(false)
    }
  }

  // Accepts "identifier, amount[, category]" per line — category defaults to Membership
  // Subscription when omitted, matching the single-add form's default.
  const parseBulkLines = (text: string): { identifier: string; amount: number; category: string }[] => {
    return text.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^(staff ?id|name|email|identifier)\s*,/i.test(l))
      .map((line) => {
        const [identifier, amount, category] = line.split(',').map((s) => s.trim())
        return {
          identifier: identifier?.replace(/^"|"$/g, '') || '',
          amount: parseFloat(amount),
          category: category && /certif|refund/i.test(category) ? 'certification' : 'membership',
        }
      })
      .filter((r) => r.identifier)
  }

  const downloadBulkTemplate = () => {
    const csv = 'Staff ID or Email or Name,Amount,Category (Membership or Certification)\nMSL-0123,25000,Membership\nsomeone@meristemng.com,15000,Certification\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'subscriptions_bulk_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleBulkCsv = async (file: File) => {
    setBulkText(await file.text())
  }

  const submitBulk = async () => {
    const rows = parseBulkLines(bulkText)
    if (rows.length === 0 || !bulkOrg.trim()) return
    setBulkSaving(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/admin/records/subscriptions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: bulkMonth, membershipOrg: bulkOrg.trim(), rows: rows.map((r) => ({ ...r, category: r.category || bulkCategory })) }),
      })
      const data = await res.json()
      if (res.ok) {
        setBulkResult(data)
        setBulkText('')
        setPage(1)
        await load()
      } else {
        alert(data.error || 'Bulk add failed.')
      }
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="Search name, Staff ID, BU, or Organization…"
            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        {!addingNew && !bulkMode && (
          <>
            <button onClick={() => setAddingNew(true)} className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg px-3 py-2 hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Add Subscription
            </button>
            <button onClick={() => setBulkMode(true)} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-50">
              <Users className="w-4 h-4" /> Bulk Add
            </button>
          </>
        )}
      </div>

      {bulkMode && (
        <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
          <p className="text-xs text-slate-500">
            One person per line: <code className="bg-slate-100 px-1 rounded">Staff ID or email or name, amount[, category]</code>.
            Each person can have a different amount and category (Membership/Certification) — leave category off a line to use the default below.
            Paste directly, or download the template, fill it in, and upload it.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'MSL-0123, 25000, Membership\nsomeone@meristemng.com, 15000, Certification'}
            rows={6}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Membership Organization</label>
              <input value={bulkOrg} onChange={(e) => setBulkOrg(e.target.value)} placeholder="Applied to every row" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Month</label>
              <select value={bulkMonth} onChange={(e) => setBulkMonth(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Default Category</label>
              <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="membership">Membership Subscription</option>
                <option value="certification">Certification Refund</option>
              </select>
            </div>
          </div>
          {bulkResult && (
            <div className="text-xs space-y-0.5">
              <p className="text-emerald-700">{bulkResult.added} record(s) added.</p>
              {bulkResult.notFound.length > 0 && <p className="text-red-600">Not found in the roster: {bulkResult.notFound.join(', ')}</p>}
              {bulkResult.invalid.length > 0 && <p className="text-amber-700">Missing/invalid amount: {bulkResult.invalid.join(', ')}</p>}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={submitBulk}
              disabled={bulkSaving || parseBulkLines(bulkText).length === 0 || !bulkOrg.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {bulkSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add {parseBulkLines(bulkText).length > 0 ? `${parseBulkLines(bulkText).length} ` : ''}Record(s)
            </button>
            <button onClick={downloadBulkTemplate} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <Download className="w-3.5 h-3.5" /> Download Template
            </button>
            <button onClick={() => bulkCsvRef.current?.click()} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
              <Upload className="w-3.5 h-3.5" /> Upload CSV
            </button>
            <input ref={bulkCsvRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBulkCsv(f); e.target.value = '' }} />
            <button onClick={() => { setBulkMode(false); setBulkText(''); setBulkResult(null) }} className="text-sm text-slate-500 hover:text-slate-700 ml-auto">Cancel</button>
          </div>
        </div>
      )}

      {addingNew && (
        <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50/30">
          <div className="relative">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Staff member</label>
            {pickedStaff ? (
              <div className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-800">{pickedStaff.name}</span>
                <span className="text-slate-400">{pickedStaff.staffId} · {pickedStaff.businessUnit}</span>
                <button onClick={() => setPickedStaff(null)} className="ml-auto text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <>
                <input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search by name, email, or Staff ID…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                {pickerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {pickerResults.map((s) => (
                      <button key={s.staffId} onClick={() => { setPickedStaff(s); setPickerQuery('') }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-2">
                        <span className="text-slate-700">{s.name}</span>
                        <span className="text-slate-400">{s.staffId} · {s.businessUnit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Membership Organization</label>
              <input value={newOrg} onChange={(e) => setNewOrg(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Amount (₦)</label>
              <input type="number" min={0} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Month</label>
              <select value={newMonth} onChange={(e) => setNewMonth(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="membership">Membership Subscription</option>
                <option value="certification">Certification Refund</option>
              </select>
            </div>
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={addRecord}
              disabled={!pickedStaff || !newOrg.trim() || !newAmount || addSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {addSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
            <button onClick={() => { setAddingNew(false); setPickedStaff(null); setAddError('') }} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Staff ID</th>
              <th className="px-3 py-2">Business Unit</th>
              <th className="px-3 py-2">Organization</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-400">No subscription records found.</td></tr>
            ) : rows.map((r) => {
              const isEditing = editingId === r.id
              return (
                <tr key={r.id} className="border-b border-slate-100">
                  {isEditing && draft ? (
                    <>
                      <td className="px-3 py-1.5"><input value={draft.staffName} onChange={(e) => setDraft({ ...draft, staffName: e.target.value })} className="w-full border border-slate-200 rounded px-2 py-1 text-sm" /></td>
                      <td className="px-3 py-1.5 text-slate-500">{r.staffId}</td>
                      <td className="px-3 py-1.5"><input value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} className="w-full border border-slate-200 rounded px-2 py-1 text-sm" /></td>
                      <td className="px-3 py-1.5"><input value={draft.membershipOrg} onChange={(e) => setDraft({ ...draft, membershipOrg: e.target.value })} className="w-full border border-slate-200 rounded px-2 py-1 text-sm" /></td>
                      <td className="px-3 py-1.5"><input type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="w-24 border border-slate-200 rounded px-2 py-1 text-sm" /></td>
                      <td className="px-3 py-1.5">
                        <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="border border-slate-200 rounded px-2 py-1 text-sm">
                          <option value="membership">Membership</option>
                          <option value="certification">Certification</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} className="border border-slate-200 rounded px-2 py-1 text-sm">
                          <option value="">—</option>
                          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => saveEdit(r)} disabled={saving} className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => { setEditingId(null); setDraft(null) }} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-slate-800">{r.staffName}</td>
                      <td className="px-3 py-2 text-slate-500">{r.staffId}</td>
                      <td className="px-3 py-2 text-slate-600">{r.businessUnit}</td>
                      <td className="px-3 py-2 text-slate-600">{r.membershipOrg}</td>
                      <td className="px-3 py-2 text-slate-600 tabular-nums"><NairaSign className="w-3 h-3 inline mr-0.5" />{r.amount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-600">{CATEGORY_LABELS[r.category] || r.category}</td>
                      <td className="px-3 py-2 text-slate-600">{r.month || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteRow(r.id)} disabled={deletingId === r.id} className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50">
                            {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalItems={total} pageSize={pageSize} onChange={setPage} />
    </div>
  )
}
