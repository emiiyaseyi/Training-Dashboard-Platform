import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { loadRosterDirectory } from '@/lib/staff-directory'

// Public, token-scoped search for the "add someone missing" step on the roster-review page — the
// manager isn't logged into the admin, so this can't reuse an admin-only roster endpoint. Only
// returns the minimal fields the roster-review UI needs (no email), and requires a valid token so
// it isn't a bare public roster-search endpoint.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-manager-search', 60, 60_000)
  if (limited) return limited

  const { token } = await params
  const survey = await prisma.pDPManagerSurvey.findUnique({ where: { surveyToken: token }, select: { id: true } })
  if (!survey) return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase()
  if (q.length < 2) return NextResponse.json([])

  const directory = await loadRosterDirectory()
  const results = [...directory.values()]
    .filter((s) => s.active && (s.name.toLowerCase().includes(q) || s.staffId.toLowerCase().includes(q)))
    .slice(0, 8)
    .map((s) => ({ staffId: s.staffId, name: s.name, businessUnit: s.businessUnit, role: s.role }))

  return NextResponse.json(results)
}
