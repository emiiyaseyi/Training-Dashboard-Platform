import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const units = await prisma.businessUnit.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json(units)
  } catch (err) {
    console.error('[business-units GET]', err)
    return NextResponse.json({ error: 'Failed to fetch business units.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, budget, staffCount } = body as { name: string; budget: number; staffCount: number }

    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })

    const unit = await prisma.businessUnit.upsert({
      where: { name },
      update: { budget: budget ?? 0, staffCount: staffCount ?? 0 },
      create: { name, budget: budget ?? 0, staffCount: staffCount ?? 0 },
    })

    return NextResponse.json(unit)
  } catch (err) {
    console.error('[business-units POST]', err)
    return NextResponse.json({ error: 'Failed to save business unit.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, budget, staffCount } = body as { id: string; budget: number; staffCount: number }

    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })

    const unit = await prisma.businessUnit.update({
      where: { id },
      data: { budget: budget ?? 0, staffCount: staffCount ?? 0 },
    })

    return NextResponse.json(unit)
  } catch (err) {
    console.error('[business-units PUT]', err)
    return NextResponse.json({ error: 'Failed to update business unit.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { id } = body as { id: string }

    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })

    await prisma.businessUnit.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[business-units DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete business unit.' }, { status: 500 })
  }
}
