import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const surveys = await prisma.newHireExperienceSurvey.findMany({ orderBy: { hireDate: 'desc' } })
  return NextResponse.json({ surveys })
}
