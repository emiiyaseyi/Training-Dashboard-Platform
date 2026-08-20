import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

const DEFAULT_TYPES = [
  { name: 'Internal Training', classification: 'formal', order: 0 },
  { name: 'External Training', classification: 'formal', order: 1 },
  { name: 'TM',                classification: 'formal', order: 2 },
  { name: 'Summit',            classification: 'other',  order: 3 },
  { name: 'Leadership Cafe',   classification: 'other',  order: 4 },
  { name: 'Workshop',          classification: 'other',  order: 5 },
]

export async function GET() {
  try {
    const count = await prisma.trainingType.count()
    if (count === 0) {
      await prisma.trainingType.createMany({ data: DEFAULT_TYPES })
    }
    const types = await prisma.trainingType.findMany({ orderBy: { order: 'asc' } })
    return NextResponse.json(types)
  } catch (err) {
    console.error('[training-types GET]', err)
    return NextResponse.json({ error: 'Failed to fetch training types.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { name, classification, order } = body as { name: string; classification: string; order?: number }

    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    if (classification !== 'formal' && classification !== 'other') {
      return NextResponse.json({ error: 'Classification must be "formal" or "other".' }, { status: 400 })
    }

    const type = await prisma.trainingType.upsert({
      where: { name },
      update: { classification, order: order ?? 0 },
      create: { name, classification, order: order ?? 0 },
    })

    return NextResponse.json(type)
  } catch (err) {
    console.error('[training-types POST]', err)
    return NextResponse.json({ error: 'Failed to save training type.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { id, name, classification, order } = body as { id: string; name: string; classification: string; order?: number }

    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    if (classification !== 'formal' && classification !== 'other') {
      return NextResponse.json({ error: 'Classification must be "formal" or "other".' }, { status: 400 })
    }

    const type = await prisma.trainingType.update({
      where: { id },
      data: { name, classification, order: order ?? 0 },
    })

    return NextResponse.json(type)
  } catch (err) {
    console.error('[training-types PUT]', err)
    return NextResponse.json({ error: 'Failed to update training type.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { id } = body as { id: string }

    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })

    await prisma.trainingType.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[training-types DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete training type.' }, { status: 500 })
  }
}
