'use client'

import { useState, Suspense } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, ArrowLeft } from 'lucide-react'
import { hasAccess, HR_UNIT_KEYS } from '@/lib/permissions'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Set when middleware/AppShell redirected here from a specific protected page a signed-out
  // visitor was actually trying to reach — a genuine deep link worth honoring. But NextAuth's
  // own middleware also sets callbackUrl=/ for the single most common case of all: someone
  // simply visiting the bare domain (typing it, or a mobile homescreen bookmark) while signed
  // out. That's not a deliberate request for Learning Intelligence specifically, so '/' alone
  // must NOT short-circuit the permission-based landing page below — only a more specific path
  // counts as an explicit destination.
  const rawCallbackUrl = searchParams.get('callbackUrl')
  const explicitCallbackUrl = rawCallbackUrl && rawCallbackUrl !== '/' ? rawCallbackUrl : null

  const [step, setStep] = useState<'identifier' | 'password'>('identifier')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const attemptSignIn = async (withPassword: string) => {
    setLoading(true)
    setError('')
    const result = await signIn('credentials', {
      identifier: identifier.trim(),
      password: withPassword,
      redirect: false,
    })
    setLoading(false)
    if (result?.error) {
      setError('Invalid Staff ID/email or password.')
      return
    }
    router.push(await resolveLandingPage())
    router.refresh()
  }

  // Where a direct (non-redirected) login lands — HR Summary is the primary landing page now
  // (including for super admins, who can technically see everything, so "can see Learning
  // Intelligence" alone can't be the tiebreaker), falling back to Learning Intelligence only for
  // someone with no HR access at all, and to "/" (AppShell's own access-restricted screen) for
  // someone with no permissions whatsoever.
  const resolveLandingPage = async (): Promise<string> => {
    if (explicitCallbackUrl) return explicitCallbackUrl
    const session = await getSession()
    const perms = session?.user?.permissions
    const isSuperAdmin = !!session?.user?.isSuperAdmin
    const canSeeHr = isSuperAdmin || hasAccess(perms?.['hr-summary'], 'view') || HR_UNIT_KEYS.some((k) => hasAccess(perms?.[k], 'view'))
    // '/' either shows Learning Intelligence (if they have access) or AppShell's own
    // access-restricted screen (if they have neither) — both correct outcomes for "no HR access".
    return canSeeHr ? '/hr' : '/'
  }

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      })
      const data = await res.json()
      setLoading(false)
      if (!data.exists) {
        setError('Staff ID/email not found.')
        return
      }
      if (data.requiresPassword) {
        setStep('password')
      } else {
        await attemptSignIn('')
      }
    } catch {
      setLoading(false)
      setError('Something went wrong — please try again.')
    }
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    attemptSignIn(password)
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-meristem-50 via-meristem-100 to-meristem-50 px-4 relative">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-2xl shadow-sm px-8 py-5 mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand asset, not worth next/image's config for a login page */}
            <img src="/brand/meristem-logo.png" alt="Meristem" className="h-10 w-auto" />
          </div>
          <p className="text-meristem-900 font-semibold text-lg">Human Resources</p>
          <p className="text-meristem-600 text-sm">Analytical Platform</p>
        </div>

        {step === 'identifier' ? (
          <form onSubmit={handleContinue} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Staff ID or Email</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. MSL-0123 or you@meristem.com"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-meristem-600 focus:border-transparent"
                autoFocus
                required
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-meristem-600 hover:bg-meristem-700 text-white text-sm font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <button
              type="button"
              onClick={() => { setStep('identifier'); setPassword(''); setError('') }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              <ArrowLeft className="w-3 h-3" />
              {identifier}
            </button>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-meristem-600 focus:border-transparent"
                autoFocus
                required
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-meristem-600 hover:bg-meristem-700 text-white text-sm font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </button>
          </form>
        )}

        <p className="text-center text-slate-500 text-xs mt-6">
          Access is managed by your platform administrator.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
