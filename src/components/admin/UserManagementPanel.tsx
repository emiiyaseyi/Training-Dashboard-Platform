'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, KeyRound, ChevronDown, ChevronUp, ShieldCheck, Loader2 } from 'lucide-react'
import { PAGE_KEYS, PAGE_LABELS, PERMISSION_LEVELS, PERMISSION_LEVEL_LABELS, type PageKey } from '@/lib/permissions'

type PermMap = Partial<Record<PageKey, string>>

type UserRow = {
  id: string
  staffId: string | null
  email: string | null
  name: string
  isSuperAdmin: boolean
  businessUnitScope: string
  requiresPassword: boolean
  isActive: boolean
  permissions: PermMap
}

type DraftUser = {
  key: string
  staffId: string
  email: string
  name: string
  isSuperAdmin: boolean
  businessUnitScope: string
  requiresPassword: boolean
  permissions: PermMap
}

function emptyDraft(): DraftUser {
  return {
    key: Math.random().toString(36).slice(2),
    staffId: '',
    email: '',
    name: '',
    isSuperAdmin: false,
    businessUnitScope: 'ALL',
    requiresPassword: true,
    permissions: {},
  }
}

function PermissionGrid({
  permissions,
  onChange,
  disabled,
}: {
  permissions: PermMap
  onChange: (page: PageKey, level: string) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
      {PAGE_KEYS.map((page) => (
        <div key={page} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600">{PAGE_LABELS[page]}</span>
          <select
            disabled={disabled}
            value={permissions[page] || 'none'}
            onChange={(e) => onChange(page, e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="none">No access</option>
            {PERMISSION_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {PERMISSION_LEVEL_LABELS[lvl]}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [buOptions, setBuOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [drafts, setDrafts] = useState<DraftUser[]>([emptyDraft()])
  const [saving, setSaving] = useState(false)
  const [addErrors, setAddErrors] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<UserRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [usersRes, buRes] = await Promise.all([fetch('/api/admin/users'), fetch('/api/business-units')])
      const usersData = await usersRes.json()
      const buData = await buRes.json()
      setUsers(usersData)
      setBuOptions((buData as { name: string }[]).map((b) => b.name))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const updateDraft = (key: string, patch: Partial<DraftUser>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  const submitDrafts = async () => {
    setSaving(true)
    setAddErrors([])
    try {
      const payload = {
        users: drafts.map((d) => ({
          staffId: d.staffId || null,
          email: d.email || null,
          name: d.name,
          isSuperAdmin: d.isSuperAdmin,
          businessUnitScope: d.businessUnitScope,
          requiresPassword: d.requiresPassword,
          permissions: Object.fromEntries(Object.entries(d.permissions).filter(([, v]) => v && v !== 'none')),
        })),
      }
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.errors?.length) setAddErrors(data.errors)
      if (data.created?.length) {
        setDrafts([emptyDraft()])
        if (!data.errors?.length) setShowAddForm(false)
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (user: UserRow) => {
    setEditingId(user.id)
    setEditDraft({ ...user, permissions: { ...user.permissions } })
  }

  const saveEdit = async () => {
    if (!editDraft) return
    setSaving(true)
    try {
      await fetch(`/api/admin/users/${editDraft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: editDraft.staffId,
          email: editDraft.email,
          name: editDraft.name,
          isSuperAdmin: editDraft.isSuperAdmin,
          businessUnitScope: editDraft.businessUnitScope,
          requiresPassword: editDraft.requiresPassword,
          isActive: editDraft.isActive,
          permissions: Object.fromEntries(Object.entries(editDraft.permissions).filter(([, v]) => v && v !== 'none')),
        }),
      })
      setEditingId(null)
      setEditDraft(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const resetPassword = async (id: string) => {
    if (!confirm('Reset this user’s password back to their Staff ID/email? They will be required to set a new one on next login.')) return
    await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPassword: true }),
    })
    await load()
  }

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}’s access? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Failed to remove user.')
      return
    }
    await load()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <Users className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">User Access</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage who can sign in, which pages they see, and their permission level per page.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowAddForm((v) => !v)
            setDrafts([emptyDraft()])
            setAddErrors([])
          }}
          className="flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-200 rounded-lg px-3 py-1.5 hover:bg-navy-50 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add User
        </button>
      </div>

      {showAddForm && (
        <div className="mb-5 space-y-4">
          {drafts.map((draft, idx) => (
            <div key={draft.key} className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">New User {idx + 1}</p>
                {drafts.length > 1 && (
                  <button
                    onClick={() => setDrafts((prev) => prev.filter((d) => d.key !== draft.key))}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  placeholder="Full name"
                  value={draft.name}
                  onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
                  className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                />
                <input
                  placeholder="Staff ID (e.g. MSL-0123)"
                  value={draft.staffId}
                  onChange={(e) => updateDraft(draft.key, { staffId: e.target.value })}
                  className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                />
                <input
                  placeholder="Email (optional)"
                  value={draft.email}
                  onChange={(e) => updateDraft(draft.key, { email: e.target.value })}
                  className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span>Business Unit access</span>
                  <select
                    value={draft.businessUnitScope}
                    onChange={(e) => updateDraft(draft.key, { businessUnitScope: e.target.value })}
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                  >
                    <option value="ALL">All Business Units</option>
                    {buOptions.map((bu) => (
                      <option key={bu} value={bu}>
                        {bu}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={draft.requiresPassword}
                    onChange={(e) => updateDraft(draft.key, { requiresPassword: e.target.checked })}
                  />
                  Requires password
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={draft.isSuperAdmin}
                    onChange={(e) => updateDraft(draft.key, { isSuperAdmin: e.target.checked })}
                  />
                  Super Admin (full access, ignores permissions below)
                </label>
              </div>
              {!draft.isSuperAdmin && (
                <PermissionGrid
                  permissions={draft.permissions}
                  onChange={(page, level) => updateDraft(draft.key, { permissions: { ...draft.permissions, [page]: level } })}
                />
              )}
            </div>
          ))}

          {addErrors.length > 0 && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-0.5">
              {addErrors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrafts((prev) => [...prev, emptyDraft()])}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Another
            </button>
            <button
              onClick={submitDrafts}
              disabled={saving || drafts.every((d) => !d.name.trim())}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save {drafts.length > 1 ? `All (${drafts.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="text-xs text-slate-400">No users yet.</p>
      ) : (
        <div className="space-y-2">
          {users.map((user) => {
            const isEditing = editingId === user.id
            return (
              <div key={user.id} className={`border rounded-lg ${user.isActive ? 'border-slate-200' : 'border-slate-100 bg-slate-50/50'}`}>
                <button
                  onClick={() => (isEditing ? (setEditingId(null), setEditDraft(null)) : startEdit(user))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {user.isSuperAdmin && <ShieldCheck className="w-3.5 h-3.5 text-gold-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${user.isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                        {user.name} {!user.isActive && <span className="text-[10px] font-normal">(inactive)</span>}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {[user.staffId, user.email].filter(Boolean).join(' • ') || '—'} · {user.businessUnitScope === 'ALL' ? 'All BUs' : user.businessUnitScope}
                      </p>
                    </div>
                  </div>
                  {isEditing ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>

                {isEditing && editDraft && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                      />
                      <input
                        value={editDraft.staffId || ''}
                        placeholder="Staff ID"
                        onChange={(e) => setEditDraft({ ...editDraft, staffId: e.target.value })}
                        className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                      />
                      <input
                        value={editDraft.email || ''}
                        placeholder="Email"
                        onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                        className="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span>Business Unit access</span>
                        <select
                          value={editDraft.businessUnitScope}
                          onChange={(e) => setEditDraft({ ...editDraft, businessUnitScope: e.target.value })}
                          className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                        >
                          <option value="ALL">All Business Units</option>
                          {buOptions.map((bu) => (
                            <option key={bu} value={bu}>
                              {bu}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={editDraft.requiresPassword}
                          onChange={(e) => setEditDraft({ ...editDraft, requiresPassword: e.target.checked })}
                        />
                        Requires password
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={editDraft.isSuperAdmin}
                          onChange={(e) => setEditDraft({ ...editDraft, isSuperAdmin: e.target.checked })}
                        />
                        Super Admin
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={editDraft.isActive}
                          onChange={(e) => setEditDraft({ ...editDraft, isActive: e.target.checked })}
                        />
                        Active
                      </label>
                    </div>
                    {!editDraft.isSuperAdmin && (
                      <PermissionGrid
                        permissions={editDraft.permissions}
                        onChange={(page, level) => setEditDraft({ ...editDraft, permissions: { ...editDraft.permissions, [page]: level } })}
                      />
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => resetPassword(user.id)}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-navy-600"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Reset password
                        </button>
                        <button
                          onClick={() => deleteUser(user.id, user.name)}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
                      >
                        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
