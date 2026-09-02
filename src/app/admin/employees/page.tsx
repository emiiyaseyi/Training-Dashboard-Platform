'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Search, Plus, Loader2, Pencil, UserX, UserCheck, Trash2, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination, paginate } from '@/components/ui/Pagination'

interface Employee {
  id: string
  staffId: string
  firstName: string
  middleName: string | null
  lastName: string
  name: string
  email: string | null
  businessUnit: string
  department: string | null
  role: string | null
  employmentType: string | null
  active: boolean
  lineManagerStaffId: string | null
}

interface BusinessUnitOption {
  id: string
  name: string
}

type Draft = {
  staffId: string; firstName: string; middleName: string; lastName: string
  email: string; businessUnit: string; department: string; role: string; employmentType: string
  lineManagerStaffId: string
}

interface StaffOption { staffId: string; label: string }

const EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time', 'Intern', 'Contract']
const PAGE_SIZE = 20

function emptyDraft(): Draft {
  return { staffId: '', firstName: '', middleName: '', lastName: '', email: '', businessUnit: '', department: '', role: '', employmentType: '', lineManagerStaffId: '' }
}

// Every field is a labeled <label> wrapping its input, not a bare placeholder — a placeholder
// disappears the moment a field has a value, which is always true when editing an existing
// employee, making it impossible to tell which field is which.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-slate-500">
      {label}
      <span className="block mt-1">{children}</span>
    </label>
  )
}

function EmployeeForm({
  draft,
  setDraft,
  businessUnits,
  staffOptions,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  businessUnits: BusinessUnitOption[]
  staffOptions: StaffOption[]
  onSave: () => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const inputClass = "w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
  const lineManagerLabel = staffOptions.find((o) => o.staffId === draft.lineManagerStaffId)?.label || draft.lineManagerStaffId
  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Staff ID">
          <input value={draft.staffId} onChange={(e) => setDraft({ ...draft, staffId: e.target.value })} className={inputClass} />
        </Field>
        <Field label="First name">
          <input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Middle name (optional)">
          <input value={draft.middleName} onChange={(e) => setDraft({ ...draft, middleName: e.target.value })} className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Last name">
          <input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Email">
          <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Business Unit">
          <select value={draft.businessUnit} onChange={(e) => setDraft({ ...draft, businessUnit: e.target.value })} className={inputClass}>
            <option value="">Select Business Unit…</option>
            {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Department">
          <input value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Job role">
          <input placeholder="e.g. Internal Audit Officer" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Employment type">
          <select value={draft.employmentType} onChange={(e) => setDraft({ ...draft, employmentType: e.target.value })} className={inputClass}>
            <option value="">Employment type…</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Line Manager">
          <input
            list="line-manager-options"
            value={lineManagerLabel}
            onChange={(e) => {
              const typed = e.target.value
              const match = staffOptions.find((o) => o.label === typed)
              setDraft({ ...draft, lineManagerStaffId: match ? match.staffId : typed })
            }}
            placeholder="Search by name or Staff ID…"
            className={inputClass}
          />
          <datalist id="line-manager-options">
            {staffOptions.map((o) => <option key={o.staffId} value={o.label} />)}
          </datalist>
        </Field>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-1.5">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </div>
  )
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
  const [employmentFilter, setEmploymentFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [buFilter, setBuFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')

  const [showAddForm, setShowAddForm] = useState(false)
  const [addDraft, setAddDraft] = useState<Draft>(emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/employees')
      setEmployees(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    fetch('/api/business-units').then((r) => r.json()).then((d) => setBusinessUnits(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, employmentFilter, departmentFilter, buFilter, roleFilter])

  const departments = useMemo(() => [...new Set(employees.map((e) => e.department).filter((d): d is string => !!d))].sort(), [employees])
  const roles = useMemo(() => [...new Set(employees.map((e) => e.role).filter((r): r is string => !!r))].sort(), [employees])
  const staffById = useMemo(() => {
    const map = new Map<string, Employee>()
    for (const e of employees) map.set(e.staffId.trim().toUpperCase(), e)
    return map
  }, [employees])
  const lineManagerName = (staffId: string | null) => {
    if (!staffId) return null
    return staffById.get(staffId.trim().toUpperCase())?.name || staffId
  }
  // Excludes whoever's currently being edited from their own line-manager options — picking
  // yourself as your own manager is a real data-quality bug this has actually caused elsewhere.
  const staffOptions: StaffOption[] = useMemo(
    () => employees
      .filter((e) => e.active && e.id !== editingId)
      .map((e) => ({ staffId: e.staffId, label: `${e.name} (${e.staffId})` })),
    [employees, editingId]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter((e) => {
      if (statusFilter === 'active' && !e.active) return false
      if (statusFilter === 'inactive' && e.active) return false
      if (employmentFilter !== 'all' && (e.employmentType || '') !== employmentFilter) return false
      if (departmentFilter !== 'all' && (e.department || '') !== departmentFilter) return false
      if (buFilter !== 'all' && e.businessUnit !== buFilter) return false
      if (roleFilter !== 'all' && (e.role || '') !== roleFilter) return false
      if (q && !(e.name.toLowerCase().includes(q) || e.staffId.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q))) return false
      return true
    })
  }, [employees, query, statusFilter, employmentFilter, departmentFilter, buFilter, roleFilter])

  const pageRows = paginate(filtered, page, PAGE_SIZE)

  const addEmployee = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error || 'Failed to add employee.')
        return
      }
      setShowAddForm(false)
      setAddDraft(emptyDraft())
      await load()
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (e: Employee) => {
    setEditingId(e.id)
    setFormError(null)
    setEditDraft({
      staffId: e.staffId, firstName: e.firstName, middleName: e.middleName || '', lastName: e.lastName,
      email: e.email || '', businessUnit: e.businessUnit, department: e.department || '', role: e.role || '',
      employmentType: e.employmentType || '', lineManagerStaffId: e.lineManagerStaffId || '',
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/admin/staff-quality/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data.error || 'Failed to save.')
        return
      }
      setEditingId(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (e: Employee) => {
    setBusyId(e.id)
    try {
      await fetch(`/api/admin/staff-quality/${e.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !e.active }),
      })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const deleteEmployee = async (e: Employee) => {
    if (!confirm(`Remove ${e.name || e.staffId} from the staff roster? This cannot be undone, and they will no longer be found by name/Staff ID/email anywhere in the platform (e.g. when adding attendees to a new training). Their existing training/subscription/KSS history is not affected. If they may return, use Deactivate instead.`)) return
    setBusyId(e.id)
    try {
      await fetch(`/api/admin/staff-quality/${e.id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Employees"
        subtitle="Manage the staff roster — add new employees, edit their details, and deactivate accounts."
        actions={
          <button
            onClick={() => { setShowAddForm((v) => !v); setAddDraft(emptyDraft()); setFormError(null) }}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-2 hover:bg-navy-700"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        }
      />

      <div className="p-4 sm:p-8 space-y-4">
        {showAddForm && (
          <EmployeeForm
            draft={addDraft}
            setDraft={setAddDraft}
            businessUnits={businessUnits}
            staffOptions={staffOptions}
            onSave={addEmployee}
            onCancel={() => setShowAddForm(false)}
            saving={saving}
            error={formError}
          />
        )}

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, Staff ID, or email…"
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 mr-1">Status:</span>
            {(['active', 'inactive', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full font-medium capitalize ${statusFilter === s ? 'bg-navy-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {s}
              </button>
            ))}
          </div>

          <select value={employmentFilter} onChange={(e) => setEmploymentFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <option value="all">All Employment Types</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <option value="all">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={buFilter} onChange={(e) => setBuFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <option value="all">All Business Units</option>
            {businessUnits.map((bu) => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
            <option value="all">All Job Roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Staff ID</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Business Unit</th>
                  <th className="px-4 py-2.5">Job Role</th>
                  <th className="px-4 py-2.5">Line Manager</th>
                  <th className="px-4 py-2.5">Employment</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-slate-400">Loading…</td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-xs text-slate-400">No employees match these filters.</td></tr>
                ) : (
                  pageRows.map((e) => (
                    <Fragment key={e.id}>
                      <tr className="border-b border-slate-100 last:border-0 align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{e.name || <span className="text-red-500">(no name)</span>}</p>
                          <p className="text-xs text-slate-400">{e.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{e.staffId}</td>
                        <td className="px-4 py-3 text-slate-600">{e.department || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{e.businessUnit || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{e.role || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{lineManagerName(e.lineManagerStaffId) || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{e.employmentType || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {e.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1.5">
                            <button onClick={() => (editingId === e.id ? setEditingId(null) : startEdit(e))} className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800">
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => toggleActive(e)}
                              disabled={busyId === e.id}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-700 disabled:opacity-50"
                            >
                              {e.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              {e.active ? 'Deactivate' : 'Reactivate'}
                            </button>
                            <button
                              onClick={() => deleteEmployee(e)}
                              disabled={busyId === e.id}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingId === e.id && (
                        <tr className="border-b border-slate-100 last:border-0 bg-slate-50">
                          <td colSpan={9} className="px-4 py-3">
                            <EmployeeForm
                              draft={editDraft}
                              setDraft={setEditDraft}
                              businessUnits={businessUnits}
                              staffOptions={staffOptions}
                              onSave={saveEdit}
                              onCancel={() => setEditingId(null)}
                              saving={saving}
                              error={formError}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  )
}
