'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { UserCircle, Loader2, LogOut } from 'lucide-react'

export default function AccountPage() {
  const { data: session, update } = useSession()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const forced = session?.user?.mustChangePassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to change password.')
      }
      setSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      await update()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-navy-600 flex items-center justify-center shrink-0">
          <UserCircle className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-slate-800 font-semibold">{session?.user?.name}</p>
          <p className="text-slate-500 text-xs">{session?.user?.staffId || session?.user?.email}</p>
        </div>
      </div>

      {forced && (
        <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          Your admin requires you to set a new password before continuing.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <p className="text-sm font-semibold text-slate-800">Change Password</p>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600"
            required
          />
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">Password updated.</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-navy-600 hover:bg-navy-700 text-white text-sm font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Password
        </button>
      </form>

      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="mt-6 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  )
}
