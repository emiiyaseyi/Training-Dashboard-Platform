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
    id: 'discover-company',
    section: 'Diagnostics',
    label: 'List companies (discover the real company_name/id)',
    path: '/v1/rms/companies',
    coverageNote: 'Needs no parameters beyond the credentials — lists every company registered under this account with its real id/name. Every other probe below uses a placeholder ("test") for company_name/employee_code/appraisal_cycle, which is almost certainly why they all fail with the same generic "An error occurred while processing the request" — those placeholders were never real values. Run this first, then swap in whatever real company id/name comes back for the other calls.',
  },
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
    coverageNote: 'Required params: appraisal_cycle (year) + appraisal_period (H1/H2) + company_name — no employee filter, no department/BU filter, no pagination documented. Returns one record per employee FOR THAT ONE PERIOD (the whole company at once), with employee_performance_score/performance_score/behavioural_score/final_score/appraisal_year_score, a 9-box talent classification (ninebox_matrix), and a nested employee.department object (id/name/description/parent_id/hod_id). Also has a department_score field of unconfirmed meaning — check a real sandbox response to see if SeamlessHR already computes this, or if it needs computing from employee.department ourselves. "Biannual average per employee" = native (call once per H1/H2, the scores are right there). "Average per department/BU" = not a dedicated endpoint; compute from employee.department across one call\'s full result set. "Full history since an employee joined" = NOT a single call — no employee or date-range filter exists, so it means calling this once per (cycle, period) combination since they joined and filtering client-side each time. No redeployment/transfer endpoint exists anywhere in Employee Services either — Add/Update/Activate/Deactivate/Exit only; Update Employee could overwrite the BU field but gives no history of past moves.',
  },
]

// Super-admin only, by the same logic as ta-status — this is infrastructure/credential status
// for an integration that isn't live yet, not something any HR unit viewer should see.
//
// Exploratory only: calls 5 of SeamlessHR's sandbox endpoints (one company-discovery diagnostic,
// plus one per HR section we asked them
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
