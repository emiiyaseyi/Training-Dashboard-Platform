import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const SANDBOX_BASE_URL = 'https://api-sandbox.seamlesshr.app'

// CORRECTED 2026-10-09 per SeamlessHR support's direct answer: "The error is because of the
// invalid company name. Across the endpoint always use Integration Company whenever company name
// is requested." — "Petromarine Nigeria Limited" (pulled from the Employee master record's
// "entity" field) looked like a reasonable real value but is NOT what the company_name/company
// query parameter actually expects on this sandbox; it's always the literal account name
// "Integration Company", regardless of which entity/BU an employee record itself shows. The
// sandbox is also only live during SeamlessHR's working hours (confirmed by their support team);
// outside that window every endpoint returns the same generic 400 regardless of credentials or
// parameters.
const REAL_COMPANY_NAME = 'Integration Company'
// Confirmed to exist via a successful Employee master record call — but support's holidays/leave
// balance guidance was "retry with Integration Company and an employee on that company," which
// doesn't confirm PNL11 is actually ON "Integration Company" (vs. Petromarine as a sub-entity
// under it). If these two probes still fail with this code, that's the next thing to ask support
// for directly: a real employee_code confirmed to belong to "Integration Company" itself.
const REAL_EMPLOYEE_CODE = 'PNL11'

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
// Diagnostic sweep — every one of these is genuinely parameter-free (or every parameter is
// optional with a sensible default), confirmed by reading each one's own reference page, so a
// failure here means something about the CREDENTIALS or the sandbox account itself, not a guessed
// placeholder value. Spans multiple unrelated API sections (RMS, Employee Services, Performance)
// specifically so a mix of passes/fails tells us whether the problem is account-wide or
// section-specific, instead of only ever seeing every probe fail for the same unknown reason.
const DIAGNOSTIC_PROBES: ProbeDef[] = [
  {
    id: 'discover-company',
    section: 'Diagnostics',
    label: 'List companies (RMS module)',
    path: '/v1/rms/companies',
    coverageNote: 'CONFIRMED by SeamlessHR support (2026-10-09): "RMS module is currently not available on the Sandbox." Same applies to /v1/rms/countries and /v1/rms/jobs below — all three under /v1/rms/* return 404 for this reason, not a credentials/parameter issue. Blocked on SeamlessHR enabling the module (sandbox or production) — nothing to fix on our side.',
  },
  {
    id: 'discover-countries',
    section: 'Diagnostics',
    label: 'List countries (pure reference data, zero params)',
    path: '/v1/rms/countries',
    coverageNote: 'Same CONFIRMED cause as the companies probe above — RMS module not available on this sandbox, not a parameters/timing issue.',
  },
  {
    id: 'discover-holidays',
    section: 'Diagnostics',
    label: 'Get holidays (Employee Services, zero required params)',
    path: '/v1/employees/holidays',
    coverageNote: 'Support\'s answer: "There is no issue with it, please retry with Integration Company and an employee on that company." Retrying now with the corrected company name — if this still fails, the next step is asking support for a specific employee_code confirmed to belong to "Integration Company" (this endpoint takes no company parameter directly, so the fix is really about which employee_code default/value applies).',
  },
  {
    id: 'discover-birthdays',
    section: 'Diagnostics',
    label: 'Get birthdays (Employee Services, zero required params)',
    path: '/v1/employees/birthdays',
    coverageNote: 'filterBy is optional (defaults to this-month) — no company or employee parameter at all.',
  },
  {
    id: 'discover-appraisal-cycles',
    section: 'Diagnostics',
    label: 'List appraisal cycles (real company now plugged in)',
    path: `/v1/performance/cycles?company_name=${encodeURIComponent(REAL_COMPANY_NAME)}`,
    coverageNote: `The empty result ("total": 0) is CONFIRMED a bug by SeamlessHR support, reported to their team in charge — not something to work around on our side. Still worth re-running with the corrected company_name ("Integration Company") in case that alone surfaces seeded data, but if it's still empty, we're blocked on their fix before field-mapping can be confirmed for appraisals.`,
  },
]

const PROBES: ProbeDef[] = [
  ...DIAGNOSTIC_PROBES,
  {
    id: 'es-employees',
    section: 'Employee Services',
    label: 'Employee master record',
    path: '/v1/employees?limit=5&page=1',
    coverageNote: 'Covers: Staff ID, name, BU/entity, department, grade, employment type, line manager, date of joining. UPDATE (2026-10-09): the Employee record itself also has a `last_promotion` field (date, e.g. "01/08/2026") — CONFIRMED valid by support, just blank for anyone never promoted, so it won\'t show up unless you check a promoted employee. That\'s a single most-recent-promotion date, not a full history — still no endpoint for the complete transfer/promotion timeline (every past move), so internal mobility tracking still can\'t be fully reconstructed from this API, just the latest promotion date per person.',
  },
  {
    id: 'es-leave-balance',
    section: 'Employee Services',
    label: 'Leave balance',
    path: `/v1/leave/balance?employee_code=${REAL_EMPLOYEE_CODE}&leave_type=annual&company=${encodeURIComponent(REAL_COMPANY_NAME)}`,
    coverageNote: 'Covers: days taken, days left, total/available balance — but only one employee + one leave type per call (no bulk "all balances" endpoint), so a full sync means one call per employee per leave type. Progress: the generic error is gone, now correctly reporting "Leave policy not found" for PNL11 — a real, specific error rather than a guessed-parameter failure. Support asked us for a valid employee_code + leave_type combination WITH a policy on file, which we don\'t have yet — that\'s the next thing to request from them directly to see the full response shape.',
  },
  {
    id: 'ta-jobs',
    section: 'Talent Acquisition',
    label: 'Job postings',
    path: '/v1/rms/jobs?page=1',
    coverageNote: 'GAP: this only returns public job-posting metadata (title, location, status). Requisitions (role/BU/office type/hiring manager), candidate pipeline stages, hiring source, and offer records have NO matching endpoint anywhere in SeamlessHR’s published docs — not available via this API at all, regardless of credentials. Also returned 404 "Route not found" in the last live test, same as every other /v1/rms/* path tried (companies, countries) even though those need no company-specific data at all — suggests the whole RMS/Recruitment module may not be provisioned on this account, separate from the documented data gaps.',
  },
  {
    id: 'pm-appraisals',
    section: 'Performance Management',
    label: 'Employee appraisals',
    path: `/v1/performance/appraisals?appraisal_cycle=2026&appraisal_period=H1&company_name=${encodeURIComponent(REAL_COMPANY_NAME)}`,
    coverageNote: `Required params: appraisal_cycle (year) + appraisal_period (H1/H2) + company_name — no employee filter, no department/BU filter, no pagination documented. Returns one record per employee FOR THAT ONE PERIOD (the whole company at once), with employee_performance_score/performance_score/behavioural_score/final_score/appraisal_year_score, a 9-box talent classification (ninebox_matrix), and a nested employee.department object (id/name/description/parent_id/hod_id). Also has a department_score field of unconfirmed meaning — check a real sandbox response to see if SeamlessHR already computes this, or if it needs computing from employee.department ourselves. "Biannual average per employee" = native (call once per H1/H2, the scores are right there). "Average per department/BU" = not a dedicated endpoint; compute from employee.department across one call's full result set. "Full history since an employee joined" = NOT a single call — no employee or date-range filter exists, so it means calling this once per (cycle, period) combination since they joined and filtering client-side each time. No redeployment/transfer endpoint exists anywhere in Employee Services either — Add/Update/Activate/Deactivate/Exit only; Update Employee could overwrite the BU field but gives no history of past moves. Blocked the same way as the appraisal cycles probe above — SeamlessHR confirmed the empty appraisal cycle data in sandbox is a bug on their end, so appraisal_cycle=2026 is still a guess with nothing real to substitute it with yet. Revisit once their team fixes the seeded sandbox data.`,
  },
]

// Super-admin only, by the same logic as ta-status — this is infrastructure/credential status
// for an integration that isn't live yet, not something any HR unit viewer should see.
//
// Exploratory only: calls SeamlessHR's sandbox endpoints — a set of genuinely zero/optional-param
// diagnostic probes (spanning several unrelated API sections, so a mix of passes/fails tells us
// whether an issue is account-wide or section-specific) plus one representative call per HR
// section we actually asked SeamlessHR about — with whatever credentials are in
// SEAMLESSHR_SANDBOX_CLIENT_ID/SECRET, and returns each raw response (status + body) unmodified,
// so the admin can see exactly what SeamlessHR sends back — including the literal error — to
// screenshot for their own troubleshooting.
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
