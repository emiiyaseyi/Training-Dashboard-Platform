import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const SANDBOX_BASE_URL = 'https://api-sandbox.seamlesshr.app'

interface ProbeDef {
  id: string
  section: string
  label: string
  path: string
  // What this specific call is standing in for — shown even if the call itself fails, since the
  // point here is mapping SeamlessHR's documented API surface against what we actually asked
  // them for, not just a live connectivity check.
  coverageNote: string
}

// One representative call per HR section we asked SeamlessHR about, built from reading their
// published API reference (docs.seamlesshr.com) end to end — not guessed. Each one is the best
// documented endpoint for that section; several of our requested data points (see coverageNote)
// have NO matching endpoint anywhere in their docs, which no live call can fix — that's a gap in
// what they expose, not a bug here.
const PROBES: ProbeDef[] = [
  {
    id: 'es-employees',
    section: 'Employee Services',
    label: 'Employee master record',
    path: '/v1/employees?limit=5&page=1',
    coverageNote: 'Covers: Staff ID, name, BU/entity, department, grade, employment type, line manager, date of joining. No endpoint found anywhere in the docs for transfers/promotions (internal mobility) — not available via this API.',
  },
  {
    id: 'es-leave-balance',
    section: 'Employee Services',
    label: 'Leave balance',
    path: '/v1/leave/balance?employee_code=TEST&leave_type=annual&company=test',
    coverageNote: 'Covers: days taken, days left, total/available balance — but only one employee + one leave type per call (no bulk "all balances" endpoint), so a full sync means one call per employee per leave type.',
  },
  {
    id: 'ta-jobs',
    section: 'Talent Acquisition',
    label: 'Job postings',
    path: '/v1/rms/jobs?page=1',
    coverageNote: 'GAP: this only returns public job-posting metadata (title, location, status). Requisitions (role/BU/office type/hiring manager), candidate pipeline stages, hiring source, and offer records have NO matching endpoint anywhere in SeamlessHR’s published docs — not available via this API at all, regardless of credentials.',
  },
  {
    id: 'pm-appraisals',
    section: 'Performance Management',
    label: 'Employee appraisals',
    path: '/v1/performance/appraisals?appraisal_cycle=2026&appraisal_period=H1&company_name=test',
    coverageNote: 'Covers: completion status, overall progress, performance/behavioural scores, a 9-box talent classification. Partial gap: KPI records have a "perspective" field (Customer/Financial/Internal Process/Learning & Growth), not the business/individual/strategic categories asked for — different taxonomy, not a 1:1 match. Self-assessment completion and manager-level rollup stats aren’t separate fields; they’d need to be computed from the raw per-employee records.',
  },
]

// Super-admin only, by the same logic as ta-status — this is infrastructure/credential status
// for an integration that isn't live yet, not something any HR unit viewer should see.
//
// Exploratory only: calls 4 of SeamlessHR's sandbox endpoints (one per HR section we asked them
// about) with whatever credentials are in SEAMLESSHR_SANDBOX_CLIENT_ID/SECRET and returns each
// raw response (status + body) unmodified, so the admin can see exactly what SeamlessHR sends
// back — including the literal error — to screenshot for their own troubleshooting.
export async function GET() {
  const session = await auth()
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: 'Super admin access required.' }, { status: 403 })
  }

  const clientId = process.env.SEAMLESSHR_SANDBOX_CLIENT_ID
  const clientSecret = process.env.SEAMLESSHR_SANDBOX_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      configured: false,
      error: 'SEAMLESSHR_SANDBOX_CLIENT_ID / SEAMLESSHR_SANDBOX_CLIENT_SECRET are not set.',
    })
  }

  const results = await Promise.all(
    PROBES.map(async (probe) => {
      const url = `${SANDBOX_BASE_URL}${probe.path}`
      const startedAt = Date.now()
      try {
        const res = await fetch(url, {
          headers: {
            'x-client-id': clientId,
            'x-client-secret': clientSecret,
            'Accept': 'application/json',
          },
          cache: 'no-store',
        })
        const durationMs = Date.now() - startedAt
        const text = await res.text()
        let body: unknown = text
        try {
          body = JSON.parse(text)
        } catch {
          // leave as raw text if it's not JSON
        }
        return {
          ...probe,
          requestUrl: url,
          httpStatus: res.status,
          httpStatusText: res.statusText,
          durationMs,
          responseBody: body,
        }
      } catch (err) {
        return {
          ...probe,
          requestUrl: url,
          error: err instanceof Error ? err.message : 'Request failed (network error).',
        }
      }
    })
  )

  return NextResponse.json({ configured: true, results })
}
