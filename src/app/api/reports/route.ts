import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeBUAnalytics, computeGroupAnalytics } from '@/lib/analytics'
import { generateExecutiveNarrative } from '@/lib/narrative'
import type { PeriodFilter } from '@/lib/filter-types'
import { MONTHS } from '@/lib/filter-types'

// GET /api/reports — list all generated reports
// GET /api/reports?bu=X&year=2024 — filter
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const bu = sp.get('bu')
  const year = sp.get('year') ? parseInt(sp.get('year')!) : undefined
  try {
    const reports = await prisma.monthlyReport.findMany({
      where: {
        ...(bu ? { businessUnit: bu } : {}),
        ...(year ? { year } : {}),
      },
      orderBy: [{ year: 'desc' }, { month: 'asc' }, { businessUnit: 'asc' }],
    })
    return NextResponse.json(reports)
  } catch (err) {
    console.error('[reports GET]', err)
    return NextResponse.json({ error: 'Failed to fetch reports.' }, { status: 500 })
  }
}

// POST /api/reports — generate a monthly report snapshot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { businessUnit, year, month, generatedBy } = body as {
      businessUnit: string; year: number; month: string; generatedBy?: string
    }
    if (!businessUnit || !year || !month) {
      return NextResponse.json({ error: 'businessUnit, year, and month are required.' }, { status: 400 })
    }

    const monthIdx = MONTHS.indexOf(month as typeof MONTHS[number])
    if (monthIdx === -1) return NextResponse.json({ error: 'Invalid month name.' }, { status: 400 })

    // Build a filter for the specific month in the given year
    const filter: PeriodFilter = { mode: 'range', year, fromMonth: month as typeof MONTHS[number], toMonth: month as typeof MONTHS[number] }

    let reportData: Record<string, unknown>
    let narrative: string

    if (businessUnit === 'GROUP') {
      const analytics = await computeGroupAnalytics(filter)
      const narr = generateExecutiveNarrative(analytics)
      reportData = analytics as unknown as Record<string, unknown>
      narrative = narr.join('\n')
    } else {
      const analytics = await computeBUAnalytics(businessUnit, filter)
      reportData = analytics as unknown as Record<string, unknown>
      narrative = analytics.intelligence.narrative.join('\n')
    }

    const saved = await prisma.monthlyReport.upsert({
      where: { businessUnit_year_month: { businessUnit, year, month } },
      update: {
        reportData: JSON.stringify(reportData),
        narrative,
        generatedBy: generatedBy || null,
        generatedAt: new Date(),
      },
      create: {
        businessUnit, year, month,
        reportData: JSON.stringify(reportData),
        narrative,
        generatedBy: generatedBy || null,
      },
    })

    return NextResponse.json(saved)
  } catch (err) {
    console.error('[reports POST]', err)
    return NextResponse.json({ error: 'Failed to generate report.' }, { status: 500 })
  }
}

// DELETE /api/reports?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
  try {
    await prisma.monthlyReport.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[reports DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete.' }, { status: 500 })
  }
}
