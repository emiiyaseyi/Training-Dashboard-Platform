import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const year = req.nextUrl.searchParams.get('year')
    if (year) {
      const config = await prisma.talentMemberConfig.findUnique({ where: { year: parseInt(year) } })
      return NextResponse.json(config ?? { year: parseInt(year), totalHeadcount: 0 })
    }
    const all = await prisma.talentMemberConfig.findMany({ orderBy: { year: 'desc' } })
    return NextResponse.json(all)
  } catch (err) {
    console.error('[admin/talent-member GET]', err)
    return NextResponse.json({ error: 'Failed to fetch.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { year, totalHeadcount } = body as { year: number; totalHeadcount: number }
    if (!year) return NextResponse.json({ error: 'Year is required.' }, { status: 400 })

    const config = await prisma.talentMemberConfig.upsert({
      where: { year },
      update: { totalHeadcount: totalHeadcount ?? 0 },
      create: { year, totalHeadcount: totalHeadcount ?? 0 },
    })
    return NextResponse.json(config)
  } catch (err) {
    console.error('[admin/talent-member POST]', err)
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 })
  }
}
