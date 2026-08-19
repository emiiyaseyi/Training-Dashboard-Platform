'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, Loader2, ArrowLeft } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/'

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
    router.push(callbackUrl)
    router.refresh()
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
    <div className="min-h-screen w-full flex items-center justify-center bg-navy-700 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-gold-400 flex items-center justify-center mb-4">
            <BookOpen className="w-6 h-6 text-navy-800" />
          </div>
          <p className="text-white font-semibold text-lg">Learning Intelligence</p>
          <p className="text-slate-400 text-sm">Dashboard Platform</p>
        </div>

        {step === 'identifier' ? (
          <form onSubmit={handleContinue} className="bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Staff ID or Email</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. MSL-0123 or you@meristem.com"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
                autoFocus
                required
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-navy-600 hover:bg-navy-700 text-white text-sm font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="bg-white rounded-xl shadow-xl p-6 space-y-4">
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
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
                autoFocus
                required
              />
              <p className="text-xs text-slate-400 mt-1">
                Default password is your Staff ID or email, unless your admin set it differently.
              </p>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-navy-600 hover:bg-navy-700 text-white text-sm font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60"
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
