import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
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
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => ({}))
  const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear() + 1
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : `${year} Personal Development Plan`
  const maxCapabilitiesPerPerson = Number.isFinite(Number(body.maxCapabilitiesPerPerson)) && Number(body.maxCapabilitiesPerPerson) > 0
    ? Number(body.maxCapabilitiesPerPerson)
    : null

  const cycle = await prisma.pDPCycle.create({ data: { year, title, maxCapabilitiesPerPerson } })
  return NextResponse.json(cycle)
}
