import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'view')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const [cycle, staffSurveys, managerSurveys, overrides] = await Promise.all([
    prisma.pDPCycle.findUnique({ where: { id: cycleId } }),
    prisma.pDPStaffSurvey.findMany({ where: { cycleId }, include: { validations: true } }),
    prisma.pDPManagerSurvey.findMany({ where: { cycleId }, include: { teamMembers: true } }),
    prisma.pDPManagerOverride.findMany({ where: { cycleId } }),
  ])
  if (!cycle) return NextResponse.json({ error: 'Cycle not found.' }, { status: 404 })

  return NextResponse.json({ cycle, staffSurveys, managerSurveys, overrides })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const body = await req.json().catch(() => ({}))
  const data: { title?: string; status?: string; maxCapabilitiesPerPerson?: number | null; closedAt?: Date } = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (body.maxCapabilitiesPerPerson === null || Number.isFinite(Number(body.maxCapabilitiesPerPerson))) {
    data.maxCapabilitiesPerPerson = body.maxCapabilitiesPerPerson === null ? null : Number(body.maxCapabilitiesPerPerson)
  }
  if (body.status === 'closed') {
    data.status = 'closed'
    data.closedAt = new Date()
  }

  const cycle = await prisma.pDPCycle.update({ where: { id: cycleId }, data })
  return NextResponse.json(cycle)
}
