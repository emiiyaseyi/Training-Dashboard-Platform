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
    coverageNote: `RESOLVED 2026-10-09 — the actual fix was passing a real employee_code (${REAL_EMPLOYEE_CODE}) instead of relying on the undocumented default ("Employee001", who doesn't exist in this sandbox); the "company" part of support's answer never applied here since this endpoint takes no company parameter at all. Now returns real holiday data (Christmas Day, Boxing Day, each with id/date/company_id/regions).`,
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
    label: 'Leave balance — PNL11 (annual)',
    path: `/v1/leave/balance?employee_code=${REAL_EMPLOYEE_CODE}&leave_type=annual&company=${encodeURIComponent('Petromarine Nigeria Limited')}`,
    coverageNote: `Covers: days taken, days left, total/available balance — but only one employee + one leave type per call (no bulk "all balances" endpoint), so a full sync means one call per employee per leave type. CONFIRMED 2026-10-09: company="${REAL_COMPANY_NAME}" (the account name) returned "Employee not found" for a known-real employee; switching to company="Petromarine Nigeria Limited" (that employee's own entity) changed the error to "Leave policy not found" — proving this endpoint wants the entity name, not the account name. Rather than wait on support for an example, sweeping several more real staff IDs below (all pulled directly from a successful Employee master record response) to try to find one that already has a policy on file.`,
  },
  {
    id: 'es-leave-balance-pnl1',
    section: 'Employee Services',
    label: 'Leave balance — PNL1 (annual)',
    path: `/v1/leave/balance?employee_code=PNL1&leave_type=annual&company=${encodeURIComponent('Petromarine Nigeria Limited')}`,
    coverageNote: 'Same sweep as PNL11 above, different real staff ID.',
  },
  {
    id: 'es-leave-balance-pnl21',
    section: 'Employee Services',
    label: 'Leave balance — PNL21 (annual)',
    path: `/v1/leave/balance?employee_code=PNL21&leave_type=annual&company=${encodeURIComponent('Petromarine Nigeria Limited')}`,
    coverageNote: 'Same sweep as PNL11 above, different real staff ID.',
  },
  {
    id: 'es-leave-balance-pnl22',
    section: 'Employee Services',
    label: 'Leave balance — PNL22 (annual)',
    path: `/v1/leave/balance?employee_code=PNL22&leave_type=annual&company=${encodeURIComponent('Petromarine Nigeria Limited')}`,
    coverageNote: 'Same sweep as PNL11 above, different real staff ID.',
  },
  {
    id: 'es-leave-balance-pnl23',
    section: 'Employee Services',
    label: 'Leave balance — PNL23 (annual)',
    path: `/v1/leave/balance?employee_code=PNL23&leave_type=annual&company=${encodeURIComponent('Petromarine Nigeria Limited')}`,
    coverageNote: 'Same sweep as PNL11 above, different real staff ID. If ALL 5 come back "Leave policy not found", that\'s itself a useful signal to report to support — either this sandbox genuinely has no leave policies configured for any Petromarine Nigeria Limited employee, or the leave_type value ("annual") doesn\'t match whatever their policies are actually named.',
  },
  {
    id: 'es-leave-balance-pesl1',
    section: 'Employee Services',
    label: 'Leave balance — PESL1 (annual, different entity)',
    path: `/v1/leave/balance?employee_code=PESL1&leave_type=annual&company=${encodeURIComponent('Petromarine Nigeria Limited')}`,
    coverageNote: 'PESL1 showed up in the Get birthdays probe\'s results — a different staff ID PREFIX (PESL, not PNL), suggesting a second entity/company exists in this sandbox alongside Petromarine Nigeria Limited. Testing with that PESL1 code but still against the Petromarine company value (deliberately, to see whether it fails as "Employee not found" — confirming PESL1 belongs to a DIFFERENT entity — or as "Leave policy not found" like the PNL codes).',
  },
  {
    id: 'ta-jobs',
    section: 'Talent Acquisition',
    label: 'Job postings',
    path: '/v1/rms/jobs?page=1',
    coverageNote: 'Talent Acquisition in this app IS the Recruitment module in SeamlessHR’s own terms (/v1/rms/* = RMS = Recruitment Management System) — this isn’t a separate, parallel gap from the companies/countries 404s above, it’s the exact same CONFIRMED cause: "RMS module is currently not available on the Sandbox." Beyond the sandbox-availability block, there are also documented data gaps worth knowing regardless: this endpoint only ever returns public job-posting metadata (title, location, status) — requisitions (role/BU/office type/hiring manager), candidate pipeline stages, hiring source, and offer records have NO matching endpoint anywhere in SeamlessHR’s published docs, not available via this API at all even once RMS is enabled.',
  },
  {
    id: 'pm-appraisals',
    section: 'Performance Management',
    label: 'Employee appraisals — cycle id 102, period H2',
    path: `/v1/performance/appraisals?appraisal_cycle=102&appraisal_period=H2&company_name=${encodeURIComponent(REAL_COMPANY_NAME)}`,
    coverageNote: `Required params: appraisal_cycle + appraisal_period + company_name — no employee filter, no department/BU filter, no pagination documented. Returns one record per employee FOR THAT ONE PERIOD (the whole company at once), with employee_performance_score/performance_score/behavioural_score/final_score/appraisal_year_score, a 9-box talent classification (ninebox_matrix), and a nested employee.department object. The org's real cycle structure is H1 = Jan–Jun, H2 = Jul–Dec per calendar year — today (Oct 2026) falls in H2 2026, so the earlier "H1" guess was wrong for the CURRENT date regardless of anything else, independent of whatever "H1"/"H2" actually means to this API. Retrying with H2 here, and with appraisal_cycle as the YEAR instead of the cycle id in the probe right below — testing both pairings in one sweep instead of guessing serially.`,
  },
  {
    id: 'pm-appraisals-year-h2',
    section: 'Performance Management',
    label: 'Employee appraisals — cycle=2026 (year), period H2',
    path: `/v1/performance/appraisals?appraisal_cycle=2026&appraisal_period=H2&company_name=${encodeURIComponent(REAL_COMPANY_NAME)}`,
    coverageNote: 'Same call as the probe above, but appraisal_cycle=2026 (the year, as the docs originally described it) instead of 102 (the real cycle id) — testing both interpretations of "appraisal_cycle" side by side, since neither has been confirmed correct yet. If one of these two succeeds and the other still 422s, that tells us definitively which value the parameter actually expects.',
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
