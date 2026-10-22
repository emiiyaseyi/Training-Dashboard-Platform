import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { seedDefaultPDPSections } from '@/lib/pdp-seed'

export async function GET() {
  const gate = await requirePermission('pdp', 'view')
  if (gate instanceof NextResponse) return gate

  const cycles = await prisma.pDPCycle.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { staffSurveys: true, managerSurveys: true, managerOverrides: true } },
    },
  })
  return NextResponse.json(cycles)
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => ({}))
  const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear() + 1
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : `${year} Personal Development Plan`
  const expiryDays = Number.isFinite(Number(body.expiryDays)) && Number(body.expiryDays) > 0 ? Number(body.expiryDays) : 30
  const requireManagerValidation = body.requireManagerValidation !== false

  const cycle = await prisma.pDPCycle.create({ data: { year, title, expiryDays, requireManagerValidation } })
  // Seeds Meristem's standard 2027 PDP structure (sections + questions) so a new cycle starts
  // populated with real, editable content rather than an empty form — see pdp-seed.ts.
  await seedDefaultPDPSections(cycle.id)
  return NextResponse.json(cycle)
}
