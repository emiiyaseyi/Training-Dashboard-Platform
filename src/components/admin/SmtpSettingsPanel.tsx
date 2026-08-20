'use client'

import { useEffect, useState } from 'react'
import { Mail, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'

interface SmtpState {
  host: string
  port: string
  username: string
  password: string
  fromName: string
  fromAddress: string
}

const EMPTY: SmtpState = { host: '', port: '', username: '', password: '', fromName: 'Meristem L&D', fromAddress: '' }

export function SmtpSettingsPanel() {
  const [state, setState] = useState<SmtpState>(EMPTY)
  const [passwordSet, setPasswordSet] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/smtp-settings')
      const data = await res.json()
      setState({
        host: data.host || '',
        port: data.port ? String(data.port) : '',
        username: data.username || '',
        password: '',
        fromName: data.fromName || 'Meristem L&D',
        fromAddress: data.fromAddress || '',
      })
      setPasswordSet(!!data.passwordSet)
      setConfigured(!!data.configured)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/smtp-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    if (!testEmail.trim()) return
    setSendingTest(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/smtp-settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail.trim() }),
      })
      const data = await res.json()
      setTestResult({ success: res.ok, message: res.ok ? `Test email sent to ${testEmail.trim()}.` : data.error || 'Failed to send.' })
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <SectionCard icon={Mail} title="Email (SMTP)" description="Platform-wide email sending — used by Survey Automation today, and any future notifications.">
      {loading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div
            className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2.5 border ${
              configured ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-amber-800 bg-amber-50 border-amber-200'
            }`}
          >
            {configured ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            {configured ? 'SMTP is configured and ready.' : 'SMTP is not fully configured yet — fill in the fields below.'}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">SMTP Host</label>
              <input
                value={state.host}
                onChange={(e) => setState({ ...state, host: e.target.value })}
                placeholder="smtp.gmail.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Port</label>
              <input
                value={state.port}
                onChange={(e) => setState({ ...state, port: e.target.value })}
                placeholder="587"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Username</label>
              <input
                value={state.username}
                onChange={(e) => setState({ ...state, username: e.target.value })}
                placeholder="learning@meristem.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Password {passwordSet && <span className="text-slate-400 font-normal">(already set — leave blank to keep it)</span>}
              </label>
              <input
                type="password"
                value={state.password}
                onChange={(e) => setState({ ...state, password: e.target.value })}
                placeholder={passwordSet ? '••••••••' : ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Sender display name</label>
              <input
                value={state.fromName}
                onChange={(e) => setState({ ...state, fromName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                From address <span className="text-slate-400 font-normal">(optional — defaults to Username)</span>
              </label>
              <input
                value={state.fromAddress}
                onChange={(e) => setState({ ...state, fromAddress: e.target.value })}
                placeholder="learning@meristem.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-navy-600 rounded-lg px-3 py-1.5 hover:bg-navy-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saved ? 'Saved' : 'Save Settings'}
            </button>
            <input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@meristem.com"
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs w-48"
            />
            <button
              onClick={sendTest}
              disabled={sendingTest || !testEmail.trim()}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {sendingTest && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Send Test Email
            </button>
          </div>
          {testResult && <p className={`text-xs ${testResult.success ? 'text-emerald-700' : 'text-red-600'}`}>{testResult.message}</p>}
        </div>
      )}
    </SectionCard>
  )
}
