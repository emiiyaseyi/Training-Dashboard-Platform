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
    return NextResponse.json({ emailConfigured, keyConfigured, sheetIdConfigured, serviceAccountEmail, connected: false, connectionError: null, usingSampleData: true })
  }

  const { connectionError } = await getTaDashboardData()
  return NextResponse.json({
    emailConfigured,
    keyConfigured,
    sheetIdConfigured,
    serviceAccountEmail,
    connected: !connectionError,
    connectionError,
    usingSampleData: Boolean(connectionError),
  })
}
