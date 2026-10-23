import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory } from '@/lib/staff-directory'
import { normalizeStaffIdKey } from '@/lib/staff-id'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'view')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const [cycle, staffSurveys, managerSurveys, overrides, sections, reviews, directory] = await Promise.all([
    prisma.pDPCycle.findUnique({ where: { id: cycleId } }),
    prisma.pDPStaffSurvey.findMany({ where: { cycleId }, include: { validations: true } }),
    prisma.pDPManagerSurvey.findMany({ where: { cycleId }, include: { teamMembers: true } }),
    prisma.pDPManagerOverride.findMany({ where: { cycleId } }),
    prisma.pDPSection.findMany({ where: { cycleId }, orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } }),
    prisma.pDPReview.findMany({ where: { cycleId } }),
    loadRosterDirectory(),
  ])
  if (!cycle) return NextResponse.json({ error: 'Cycle not found.' }, { status: 404 })

  // Line manager name(s) for every staff survey — resolved live from the current roster, not
  // just read off the already-created validation rows, so the report shows who WILL get a
  // validation link even before the person has submitted anything (and the second-manager
  // override, for anyone set up with one, so it's clear at a glance where to add that exception).
  const overridesByStaffId = new Map<string, string[]>()
  for (const o of overrides) {
    const key = normalizeStaffIdKey(o.staffId)
    const arr = overridesByStaffId.get(key) ?? []
    arr.push(o.secondManagerStaffId)
    overridesByStaffId.set(key, arr)
  }
  const staffSurveysWithManagers = staffSurveys.map((s) => {
    const staff = directory.get(normalizeStaffIdKey(s.staffId))
    const names: string[] = []
    if (staff?.lineManagerStaffId) {
      const mgr = directory.get(normalizeStaffIdKey(staff.lineManagerStaffId))
      names.push(mgr?.name || staff.lineManagerStaffId)
    }
    for (const secondId of overridesByStaffId.get(normalizeStaffIdKey(s.staffId)) ?? []) {
      const mgr = directory.get(normalizeStaffIdKey(secondId))
      names.push(mgr?.name || secondId)
    }
    return { ...s, lineManagerNames: names }
  })

  return NextResponse.json({ cycle, staffSurveys: staffSurveysWithManagers, managerSurveys, overrides, sections, reviews })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const body = await req.json().catch(() => ({}))
  const data: { title?: string; status?: string; expiryDays?: number; requireManagerValidation?: boolean; closedAt?: Date } = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (Number.isFinite(Number(body.expiryDays)) && Number(body.expiryDays) > 0) data.expiryDays = Number(body.expiryDays)
  if (body.requireManagerValidation !== undefined) data.requireManagerValidation = !!body.requireManagerValidation
  if (body.status === 'closed') {
    data.status = 'closed'
    data.closedAt = new Date()
  }

  const cycle = await prisma.pDPCycle.update({ where: { id: cycleId }, data })
  return NextResponse.json(cycle)
}
