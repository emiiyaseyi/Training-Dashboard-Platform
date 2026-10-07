import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { getTaDashboardData } from '@/lib/ta-sheets'

// Gated on canAdmin for hr-talent-acquisition — same access-right scheme as every other HR unit
// admin page/route (Talent Management, etc.), not isSuperAdmin only.
export async function GET() {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const emailConfigured = Boolean(process.env.TA_GOOGLE_SERVICE_ACCOUNT_EMAIL)
  const keyConfigured = Boolean(process.env.TA_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
  const sheetIdConfigured = Boolean(process.env.TA_GOOGLE_SHEET_ID)
  const serviceAccountEmail = process.env.TA_GOOGLE_SERVICE_ACCOUNT_EMAIL || null

  if (!emailConfigured || !keyConfigured || !sheetIdConfigured) {
    return NextResponse.json({ emailConfigured, keyConfigured, sheetIdConfigured, serviceAccountEmail, connected: false, connectionError: null, usingSampleData: true, tabRowCounts: null, tabErrors: null, unrecognizedOfferStatuses: null, suspiciousResumptionDates: null })
  }

  const { connectionError, records, pipeline, internalMobility, conversions, notConverted, vacancies, tabErrors, unrecognizedOfferStatuses, suspiciousResumptionDates } = await getTaDashboardData()
  // Per-tab row counts — Hires/Config are required (a failure there sets connectionError and the
  // whole response falls back to sample data), but Pipeline/Internal Mobility/Conversion/Not
  // Converted/Vacancies each fail SILENTLY into an empty array if their tab isn't found or
  // is misnamed (see getTaDashboardData's optionalRange) — connected: true alone can't tell the
  // admin whether a specific new tab actually came through. Surfaced here instead, so a missing/
  // misnamed tab shows as "0 rows" rather than looking identical to "connected and fine."
  const tabRowCounts = connectionError ? null : {
    hires: records.length,
    pipeline: pipeline.length,
    internalMobility: internalMobility.length,
    conversions: conversions.length,
    notConverted: notConverted.length,
    vacancies: vacancies.length,
  }
  return NextResponse.json({
    emailConfigured,
    keyConfigured,
    sheetIdConfigured,
    serviceAccountEmail,
    connected: !connectionError,
    connectionError,
    usingSampleData: Boolean(connectionError),
    tabRowCounts,
    tabErrors: connectionError ? null : tabErrors,
    unrecognizedOfferStatuses: connectionError ? null : unrecognizedOfferStatuses,
    suspiciousResumptionDates: connectionError ? null : suspiciousResumptionDates,
  })
}
