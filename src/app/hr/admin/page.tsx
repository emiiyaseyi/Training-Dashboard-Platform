'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ShieldAlert, Sheet, CheckCircle2, XCircle, AlertTriangle, ExternalLink, Users, ArrowUpRight } from 'lucide-react'
import { HR_UNIT_KEYS, PAGE_LABELS, type PageKey } from '@/lib/permissions'

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

// Super-admin only — HR Dashboard infrastructure (the Talent Acquisition sheet connection) and a
// quick view of who currently has access to which HR unit. Full add/edit/remove of a user's
// permissions still happens in the existing Admin Settings (/admin) — that generic user manager
// already lists every PageKey, HR ones included, so this page doesn't duplicate that CRUD UI,
// it just gives HR-focused visibility with a direct link to it.
export default function HrAdminPage() {
  const { data: session, status } = useSession()
  const [taStatus, setTaStatus] = useState<TaStatus | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const isSuperAdmin = session?.user?.isSuperAdmin

  useEffect(() => {
    if (!isSuperAdmin) return
    Promise.all([
      fetch('/api/hr/admin/ta-status').then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch('/api/admin/users').then((r) => (r.ok ? r.json() : Promise.reject(r))),
    ])
      .then(([ta, allUsers]) => {
        setTaStatus(ta)
        setUsers(allUsers)
      })
      .catch(() => setLoadError('Could not load HR admin data.'))
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

  const usersWithHrAccess = (users || []).filter((u) => u.isSuperAdmin || HR_UNIT_KEYS.some((k) => u.permissions[k]) || u.permissions['hr-summary'])

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
              <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-xl p-3 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Set the missing environment variable(s) above in Vercel (Project Settings → Environment Variables), then redeploy. The private key must be pasted directly into Vercel, never through chat.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-meristem-100 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-meristem-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-meristem-700" />
            <p className="text-sm font-bold text-slate-800">Who has HR access</p>
          </div>
          <Link href="/admin" className="flex items-center gap-1 text-xs font-medium text-meristem-700 hover:text-meristem-800">
            Manage in Admin Settings <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {!users ? (
          <p className="text-sm text-slate-400 p-5">Loading…</p>
        ) : usersWithHrAccess.length === 0 ? (
          <p className="text-sm text-slate-400 p-5">No one has been granted HR access yet — add users in Admin Settings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase tracking-wide border-b border-meristem-50">
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Staff ID / Email</th>
                  <th className="px-5 py-2.5 font-medium">HR Access</th>
                </tr>
              </thead>
              <tbody>
                {usersWithHrAccess.map((u) => (
                  <tr key={u.id} className="border-b border-meristem-50 last:border-0">
                    <td className="px-5 py-3 text-slate-800 font-medium">{u.name}</td>
                    <td className="px-5 py-3 text-slate-500">{u.staffId || u.email || '—'}</td>
                    <td className="px-5 py-3">
                      {u.isSuperAdmin ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-meristem-700 bg-meristem-50 rounded-full px-2 py-0.5">Super Admin — all units</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(['hr-summary', ...HR_UNIT_KEYS] as PageKey[])
                            .filter((k) => u.permissions[k])
                            .map((k) => (
                              <span key={k} className="text-[10px] font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                                {PAGE_LABELS[k].replace('HR — ', '')} · {u.permissions[k]}
                              </span>
                            ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        <ExternalLink className="w-3 h-3" /> To grant or change access, go to Admin Settings → People & Talent, and set a level under any &quot;HR —&quot; page.
      </p>
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
