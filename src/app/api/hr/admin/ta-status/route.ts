import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getTaDashboardData } from '@/lib/ta-sheets'

// Super-admin only, by explicit request — this is infrastructure/credential status, not a
// permission any HR unit viewer should see, so it's gated on isSuperAdmin directly rather than
// through the generic PageKey permission system.
export async function GET() {
  const session = await auth()
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: 'Super admin access required.' }, { status: 403 })
  }

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
