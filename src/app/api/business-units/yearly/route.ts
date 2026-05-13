import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get('year')
  try {
    if (year) {
      const configs = await prisma.businessUnitYearConfig.findMany({
        where: { year: parseInt(year) },
        orderBy: { buName: 'asc' },
      })
      return NextResponse.json(configs)
    }
    // Return all years available
    const all = await prisma.businessUnitYearConfig.findMany({ orderBy: [{ year: 'desc' }, { buName: 'asc' }] })
    return NextResponse.json(all)
  } catch (err) {
    console.error('[business-units/yearly GET]', err)
    return NextResponse.json({ error: 'Failed to fetch.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { buName, year, budget, staffCount } = body as {
      buName: string; year: number; budget: number; staffCount: number
    }
    if (!buName || !year) return NextResponse.json({ error: 'buName and year required.' }, { status: 400 })

    const config = await prisma.businessUnitYearConfig.upsert({
      where: { buName_year: { buName, year } },
      update: { budget: budget ?? 0, staffCount: staffCount ?? 0 },
      create: { buName, year, budget: budget ?? 0, staffCount: staffCount ?? 0 },
    })
    return NextResponse.json(config)
  } catch (err) {
    console.error('[business-units/yearly POST]', err)
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 })
  }
}
