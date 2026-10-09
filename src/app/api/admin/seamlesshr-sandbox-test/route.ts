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
    path: `/v1/employees/holidays?employee_code=${REAL_EMPLOYEE_CODE}`,
    coverageNote: `Support's answer: "There is no issue with it, please retry with Integration Company and an employee on that company." This endpoint takes NO company parameter at all (confirmed from its docs), so that part of their guidance doesn't literally apply here — the only thing to vary is employee_code, which previously used the undocumented default ("Employee001", who may not exist in this sandbox). Now passing employee_code=${REAL_EMPLOYEE_CODE} explicitly (confirmed to be a real employee via the Employee master record probe) instead of relying on the default. If this still fails identically, it's a genuine endpoint-specific issue independent of company/employee — worth re-raising with support as exactly that, since their "retry with Integration Company" answer doesn't address a company-less endpoint.`,
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
    coverageNote: `RESOLVED 2026-10-09 — the empty result WAS the wrong company_name, not the bug support thought it was: with "Integration Company" this now returns 5 real appraisal cycles (ids 2/35/69/102/103), including one marked "is_selected": true — id 102, "September 2026 Appraisal Cycle JKL" (2026-09-01 to 2026-09-30). None of the 5 objects has a field literally called "period"/"H1"/"H2" — that value for the appraisals probe below was a docs-reading guess that still needs confirming against a real successful call.`,
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
    coverageNote: 'Covers: days taken, days left, total/available balance — but only one employee + one leave type per call (no bulk "all balances" endpoint), so a full sync means one call per employee per leave type. UPDATE 2026-10-09: with company="Integration Company" this now returns "Employee not found" for PNL11 — but PNL11 definitely exists (confirmed via a successful Employee master record call, no company param there, entity "Petromarine Nigeria Limited"). So "always use Integration Company" doesn\'t hold universally for every endpoint. Testing the alternative directly in the probe right below instead of guessing again next round.',
  },
  {
    id: 'es-leave-balance-entity-name',
    section: 'Employee Services',
    label: 'Leave balance (retry with entity name instead of account name)',
    path: `/v1/leave/balance?employee_code=${REAL_EMPLOYEE_CODE}&leave_type=annual&company=${encodeURIComponent('Petromarine Nigeria Limited')}`,
    coverageNote: 'Same call as the probe above, but with company set to the employee\'s own entity ("Petromarine Nigeria Limited", from the Employee master record\'s "entity" field) instead of the account name ("Integration Company"). If THIS one succeeds (or returns "Leave policy not found" rather than "Employee not found"), it confirms /v1/leave/balance wants the entity name specifically, not the account name — the opposite of what support said applies "across the endpoint" generally. Worth reporting that distinction back to them either way, since their guidance didn\'t carve out an exception for this endpoint.',
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
    path: `/v1/performance/appraisals?appraisal_cycle=102&appraisal_period=H1&company_name=${encodeURIComponent(REAL_COMPANY_NAME)}`,
    coverageNote: `Required params: appraisal_cycle + appraisal_period + company_name — no employee filter, no department/BU filter, no pagination documented. Returns one record per employee FOR THAT ONE PERIOD (the whole company at once), with employee_performance_score/performance_score/behavioural_score/final_score/appraisal_year_score, a 9-box talent classification (ninebox_matrix), and a nested employee.department object (id/name/description/parent_id/hod_id). Also has a department_score field of unconfirmed meaning — check a real sandbox response to see if SeamlessHR already computes this, or if it needs computing from employee.department ourselves. "Biannual average per employee" = native IF cycles are split H1/H2 (call once per period, scores are right there). "Average per department/BU" = not a dedicated endpoint; compute from employee.department across one call's full result set. "Full history since an employee joined" = NOT a single call — no employee or date-range filter exists, so it means calling this once per (cycle, period) combination since they joined and filtering client-side each time. No redeployment/transfer endpoint exists anywhere in Employee Services either — Add/Update/Activate/Deactivate/Exit only. UPDATE 2026-10-09: now using appraisal_cycle=102, the real "is_selected": true cycle id from the cycles probe above (previously appraisal_cycle=2026 was a guessed year, not a real id) — appraisal_period is STILL a guess ("H1"), since that cycle ("September 2026 Appraisal Cycle JKL") runs as one single month, not split into halves, and none of the 5 real cycle objects returned has any field describing valid period values. If this still 422s, the precise question for support is: for a cycle not split into H1/H2, what value does appraisal_period expect — is there a "list appraisal periods for a cycle" endpoint we're missing in the docs?`,
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
