import { NextRequest, NextResponse } from 'next/server'
import { computeBUAnalytics } from '@/lib/analytics'

export async function GET(req: NextRequest) {
  const bu = req.nextUrl.searchParams.get('name')
  if (!bu) {
    return NextResponse.json({ error: 'Missing ?name= parameter.' }, { status: 400 })
  }
  try {
    const analytics = await computeBUAnalytics(bu)
    return NextResponse.json(analytics)
  } catch (err) {
    console.error('[analytics/bu]', err)
    return NextResponse.json({ error: 'Failed to compute BU analytics.' }, { status: 500 })
  }
}
