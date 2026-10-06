import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('skills-gaps', 'view')
  if (gate instanceof NextResponse) return gate

  const settings = await prisma.skillsGapSettings.findFirst()
  return NextResponse.json({
    criticalThreshold: settings?.criticalThreshold ?? 30,
    moderateThreshold: settings?.moderateThreshold ?? 60,
  })
}

export async function PUT(req: NextRequest) {
  const gate = await requirePermission('skills-gaps', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { criticalThreshold, moderateThreshold } = (await req.json()) as {
      criticalThreshold?: number; moderateThreshold?: number
    }
    if (
      typeof criticalThreshold !== 'number' || typeof moderateThreshold !== 'number' ||
      criticalThreshold < 0 || criticalThreshold > 100 || moderateThreshold < 0 || moderateThreshold > 100
    ) {
      return NextResponse.json({ error: 'Both thresholds must be numbers between 0 and 100.' }, { status: 400 })
    }
    if (criticalThreshold >= moderateThreshold) {
      return NextResponse.json({ error: 'Critical threshold must be lower than moderate threshold.' }, { status: 400 })
    }

    const existing = await prisma.skillsGapSettings.findFirst()
    const settings = existing
      ? await prisma.skillsGapSettings.update({ where: { id: existing.id }, data: { criticalThreshold, moderateThreshold } })
      : await prisma.skillsGapSettings.create({ data: { criticalThreshold, moderateThreshold } })

    return NextResponse.json(settings)
  } catch (err) {
    console.error('[admin/skills-gap-settings PUT]', err)
    return NextResponse.json({ error: 'Failed to save thresholds.' }, { status: 500 })
  }
}
