import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const SANDBOX_BASE_URL = 'https://api-sandbox.seamlesshr.app'

// Super-admin only, by the same logic as ta-status — this is infrastructure/credential status
// for an integration that isn't live yet, not something any HR unit viewer should see.
//
// Exploratory only: calls SeamlessHR's sandbox "Get All Employees" endpoint with whatever
// credentials are in SEAMLESSHR_SANDBOX_CLIENT_ID/SECRET and returns the raw response (status +
// body) unmodified, so the admin can see exactly what SeamlessHR sends back — including the
// literal error — to screenshot for their own troubleshooting with SeamlessHR support.
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
      error: 'SEAMLESSHR_SANDBOX_CLIENT_ID / SEAMLESSHR_SANDBOX_CLIENT_SECRET are not set in .env.local.',
    })
  }

  const url = `${SANDBOX_BASE_URL}/v1/employees?limit=5&page=1`
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

    return NextResponse.json({
      configured: true,
      requestUrl: url,
      requestHeaders: ['x-client-id', 'x-client-secret', 'Accept'],
      httpStatus: res.status,
      httpStatusText: res.statusText,
      durationMs,
      responseBody: body,
    })
  } catch (err) {
    return NextResponse.json({
      configured: true,
      requestUrl: url,
      error: err instanceof Error ? err.message : 'Request failed (network error).',
    })
  }
}
