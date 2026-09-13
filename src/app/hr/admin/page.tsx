'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { ShieldAlert, Sheet, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Users, Plus, Pencil, X, Loader2 } from 'lucide-react'
import { HR_UNIT_KEYS, PAGE_LABELS, PERMISSION_LEVELS, PERMISSION_LEVEL_LABELS, type PageKey, type PermissionLevel } from '@/lib/permissions'

interface TaStatus {
  emailConfigured: boolean
  keyConfigured: boolean
  sheetIdConfigured: boolean
  serviceAccountEmail: string | null
  connected: boolean
  connectionError: string | null
  usingSampleData: boolean
}

interface AdminUser {
  id: string
  name: string
  email: string | null
  staffId: string | null
  isSuperAdmin: boolean
  permissions: Record<string, string>
}

// The keys this page is allowed to touch — HR only. Editing here never reads or writes
// isSuperAdmin, business-unit scope, or any non-HR PageKey, even though the underlying API
// (PUT /api/admin/users/[id]) replaces a user's *entire* permission set on save — see
// mergedPermissions() below, which starts from the user's existing permissions and overlays
// only these keys, so a Learning Intelligence permission never gets silently dropped from here.
const HR_EDITABLE_KEYS = ['hr-summary', ...HR_UNIT_KEYS] as PageKey[]

type DraftPerms = Partial<Record<PageKey, '' | PermissionLevel>>

function emptyDraft(): DraftPerms {
  return Object.fromEntries(HR_EDITABLE_KEYS.map((k) => [k, ''])) as DraftPerms
}

function draftFromUser(u: AdminUser): DraftPerms {
  const d = emptyDraft()
  for (const k of HR_EDITABLE_KEYS) d[k] = (u.permissions[k] as PermissionLevel) || ''
  return d
}

// Never touches keys outside HR_EDITABLE_KEYS — every other permission the user already had
// (Learning Intelligence pages, etc.) is carried through unchanged.
function mergedPermissions(existing: Record<string, string>, draft: DraftPerms): Record<string, string> {
  const merged = { ...existing }
  for (const k of HR_EDITABLE_KEYS) {
    if (draft[k]) merged[k] = draft[k] as string
    else delete merged[k]
  }
  return merged
}

export default function HrAdminPage() {
  const { data: session, status } = useSession()
  const [taStatus, setTaStatus] = useState<TaStatus | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DraftPerms>(emptyDraft())
  const [saving, setSaving] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', staffId: '', email: '' })
  const [newDraft, setNewDraft] = useState<DraftPerms>(emptyDraft())
  const [creating, setCreating] = useState(false)

  const isSuperAdmin = session?.user?.isSuperAdmin

  const loadUsers = () => fetch('/api/admin/users').then((r) => (r.ok ? r.json() : Promise.reject(r)))

  useEffect(() => {
    if (!isSuperAdmin) return
    Promise.all([
      fetch('/api/hr/admin/ta-status').then((r) => (r.ok ? r.json() : Promise.reject(r))),
      loadUsers(),
    ])
      .then(([ta, allUsers]) => { setTaStatus(ta); setUsers(allUsers) })
      .catch(() => setLoadError('Could not load HR admin data.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin])

  if (status === 'loading') return null

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-24">
        <ShieldAlert className="w-10 h-10 text-meristem-200 mb-3" />
        <p className="text-slate-700 font-medium">Access restricted</p>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">HR admin settings are visible to Super Admins only.</p>
      </div>
    )
  }

  const usersWithHrAccess = (users || []).filter((u) => u.isSuperAdmin || HR_EDITABLE_KEYS.some((k) => u.permissions[k]))
  const usersWithoutHrAccess = (users || []).filter((u) => !u.isSuperAdmin && !HR_EDITABLE_KEYS.some((k) => u.permissions[k]))

  const startEdit = (u: AdminUser) => { setEditingId(u.id); setEditDraft(draftFromUser(u)); setSaveError(null) }

  const saveEdit = async (u: AdminUser) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: mergedPermissions(u.permissions, editDraft) }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to save.')
      setUsers(await loadUsers())
      setEditingId(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const grantAccess = async (u: AdminUser) => {
    // Quick path for a user who already exists (e.g. has L&D access) but no HR access yet —
    // opens them straight into the editor instead of requiring "Add User" for someone who
    // isn't new.
    startEdit(u)
  }

  const createUser = async () => {
    setCreating(true)
    setSaveError(null)
    try {
      const permissions = mergedPermissions({}, newDraft)
      if (!newUser.name.trim()) throw new Error('Name is required.')
      if (!newUser.staffId.trim() && !newUser.email.trim()) throw new Error('Staff ID or email is required.')
      if (Object.keys(permissions).length === 0) throw new Error('Grant at least one HR permission.')

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUser.name.trim(), staffId: newUser.staffId.trim() || null, email: newUser.email.trim() || null, permissions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to create user.')
      if (data.errors?.length) throw new Error(data.errors[0])

      setUsers(await loadUsers())
      setShowAddForm(false)
      setNewUser({ name: '', staffId: '', email: '' })
      setNewDraft(emptyDraft())
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create user.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">HR Dashboard — Admin Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Super Admin only. Data source connections and who currently has HR access.</p>
      </div>

      {loadError && <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-sm text-rose-700">{loadError}</div>}

      <div className="bg-white border border-meristem-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sheet className="w-4 h-4 text-meristem-700" />
          <p className="text-sm font-bold text-slate-800">Talent Acquisition — Google Sheet Connection</p>
        </div>

        {!taStatus ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatusRow label="TA_GOOGLE_SERVICE_ACCOUNT_EMAIL" ok={taStatus.emailConfigured} />
              <StatusRow label="TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" ok={taStatus.keyConfigured} />
              <StatusRow label="TA_GOOGLE_SHEET_ID" ok={taStatus.sheetIdConfigured} />
            </div>

            {taStatus.emailConfigured && taStatus.keyConfigured && taStatus.sheetIdConfigured && (
              <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${taStatus.connected ? 'bg-meristem-50 text-meristem-800' : 'bg-rose-50 text-rose-700'}`}>
                {taStatus.connected ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                <div>
                  <p className="font-semibold">{taStatus.connected ? 'Connected — live data is showing on the Talent Acquisition pages.' : 'Connection failed — showing sample data on the Talent Acquisition pages.'}</p>
                  {taStatus.connectionError && <p className="mt-1">{taStatus.connectionError}</p>}
                </div>
              </div>
            )}

            {taStatus.serviceAccountEmail && (
              <p className="text-xs text-slate-500">
                Service account: <span className="font-mono text-slate-700">{taStatus.serviceAccountEmail}</span> — share the recruitment Google Sheet with this address as at least Viewer.
              </p>
            )}

            {(!taStatus.emailConfigured || !taStatus.keyConfigured || !taStatus.sheetIdConfigured) && (
              <div className="bg-amber-50 text-amber-700 rounded-xl p-3 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>Missing environment variable(s) — set these in Vercel (Project → Settings → Environment Variables → Production), then redeploy:</p>
                </div>
                <ul className="pl-6 list-disc space-y-1">
                  <li><span className="font-mono">TA_GOOGLE_SERVICE_ACCOUNT_EMAIL</span> — the service account&apos;s email address (from the downloaded JSON key file&apos;s <span className="font-mono">client_email</span> field).</li>
                  <li><span className="font-mono">TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</span> — the same JSON file&apos;s <span className="font-mono">private_key</span> value, pasted in full (including the BEGIN/END lines) directly into Vercel — never through chat.</li>
                  <li><span className="font-mono">TA_GOOGLE_SHEET_ID</span> — the ID from the sheet&apos;s URL (the long string between <span className="font-mono">/d/</span> and <span className="font-mono">/edit</span>).</li>
                </ul>
                <p>The sheet also needs to be shared with that service account email as at least Viewer, with tabs named <span className="font-mono">Hires</span>, <span className="font-mono">Pipeline</span>, and <span className="font-mono">Config</span>.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {saveError && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-100 rounded-2xl p-3 text-xs text-rose-700">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="bg-white border border-meristem-100 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-meristem-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Who has HR access</p>
          </div>
          <button
            onClick={() => { setShowAddForm((v) => !v); setSaveError(null) }}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-meristem-600 hover:bg-meristem-700 rounded-lg px-3 py-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add User
          </button>
        </div>

        {showAddForm && (
          <div className="p-5 border-b border-meristem-50 bg-meristem-50/40 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} className="text-sm border border-meristem-100 rounded-lg px-3 py-2" />
              <input placeholder="Staff ID" value={newUser.staffId} onChange={(e) => setNewUser((p) => ({ ...p, staffId: e.target.value }))} className="text-sm border border-meristem-100 rounded-lg px-3 py-2" />
              <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} className="text-sm border border-meristem-100 rounded-lg px-3 py-2" />
            </div>
            <PermissionGrid draft={newDraft} onChange={setNewDraft} />
            <div className="flex items-center gap-2">
              <button onClick={createUser} disabled={creating} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-meristem-600 hover:bg-meristem-700 disabled:opacity-60 rounded-lg px-3 py-1.5">
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create User
              </button>
              <button onClick={() => setShowAddForm(false)} className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5">Cancel</button>
            </div>
            <p className="text-[11px] text-slate-400">Sign-in defaults to the Staff ID/email as the initial password — the user is asked to change it on first login.</p>
          </div>
        )}

        {!users ? (
          <p className="text-sm text-slate-400 p-5">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Staff ID / Email</th>
                  <th className="px-5 py-2.5 font-medium">HR Access</th>
                  <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersWithHrAccess.map((u) => (
                  <tr key={u.id} className="border-b border-meristem-50 last:border-0 align-top">
                    <td className="px-5 py-3 text-slate-800 font-medium whitespace-nowrap">{u.name}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{u.staffId || u.email || '—'}</td>
                    <td className="px-5 py-3">
                      {u.isSuperAdmin ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-meristem-700 bg-meristem-50 rounded-full px-2 py-0.5">Super Admin — all units</span>
                      ) : editingId === u.id ? (
                        <PermissionGrid draft={editDraft} onChange={setEditDraft} />
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {HR_EDITABLE_KEYS.filter((k) => u.permissions[k]).map((k) => (
                            <span key={k} className="text-[10px] font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                              {PAGE_LABELS[k].replace('HR — ', '')} · {u.permissions[k]}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {u.isSuperAdmin ? null : editingId === u.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveEdit(u)} disabled={saving} className="text-meristem-700 font-semibold hover:text-meristem-800 disabled:opacity-60">
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(u)} className="flex items-center gap-1 text-slate-500 hover:text-meristem-700 ml-auto">
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {usersWithoutHrAccess.length > 0 && (
        <div className="bg-white border border-meristem-100 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-meristem-50">
            <p className="text-sm font-bold text-slate-800">Existing users without HR access</p>
            <p className="text-xs text-slate-400 mt-0.5">Already in the system (e.g. Learning Intelligence users) — grant them HR access here instead of creating a duplicate account.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {usersWithoutHrAccess.map((u) => (
                  <tr key={u.id} className="border-b border-meristem-50 last:border-0">
                    <td className="px-5 py-3 text-slate-800 font-medium whitespace-nowrap">{u.name}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{u.staffId || u.email || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => grantAccess(u)} className="flex items-center gap-1 text-meristem-700 hover:text-meristem-800 font-medium ml-auto">
                        <Plus className="w-3 h-3" /> Grant HR access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingId && usersWithoutHrAccess.some((u) => u.id === editingId) && (
        <div className="bg-white border border-meristem-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-800 mb-3">Grant HR access — {usersWithoutHrAccess.find((u) => u.id === editingId)?.name}</p>
          <PermissionGrid draft={editDraft} onChange={setEditDraft} />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => saveEdit(usersWithoutHrAccess.find((u) => u.id === editingId)!)}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-meristem-600 hover:bg-meristem-700 disabled:opacity-60 rounded-lg px-3 py-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
            </button>
            <button onClick={() => setEditingId(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5">Cancel</button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        <ExternalLink className="w-3 h-3" /> This editor only ever changes HR permissions — a user&apos;s Learning Intelligence access, Super Admin status, and business-unit scope stay exactly as they were.
      </p>
    </div>
  )
}

function PermissionGrid({ draft, onChange }: { draft: DraftPerms; onChange: (d: DraftPerms) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
      {HR_EDITABLE_KEYS.map((k) => (
        <label key={k} className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
          {PAGE_LABELS[k].replace('HR — ', '')}
          <select
            value={draft[k] || ''}
            onChange={(e) => onChange({ ...draft, [k]: e.target.value as PermissionLevel | '' })}
            className="text-xs border border-meristem-100 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">No access</option>
            {PERMISSION_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{PERMISSION_LEVEL_LABELS[lvl]}</option>)}
          </select>
        </label>
      ))}
    </div>
  )
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium ${ok ? 'bg-meristem-50 text-meristem-800' : 'bg-rose-50 text-rose-700'}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
      <span className="font-mono truncate">{label}</span>
    </div>
  )
}
