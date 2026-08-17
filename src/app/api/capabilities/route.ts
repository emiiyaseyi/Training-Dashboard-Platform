import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const capabilities = await prisma.differentiatingCapability.findMany({ orderBy: { order: 'asc' } })
    return NextResponse.json(capabilities)
  } catch (err) {
    console.error('[capabilities GET]', err)
    return NextResponse.json({ error: 'Failed to fetch capabilities.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, order } = body as { name: string; order?: number }

    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })

    const capability = await prisma.differentiatingCapability.upsert({
      where: { name },
      update: { order: order ?? 0 },
      create: { name, order: order ?? 0 },
    })

    return NextResponse.json(capability)
  } catch (err) {
    console.error('[capabilities POST]', err)
    return NextResponse.json({ error: 'Failed to save capability.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, order } = body as { id: string; name: string; order?: number }

    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })

    const capability = await prisma.differentiatingCapability.update({
      where: { id },
      data: { name, order: order ?? 0 },
    })

    return NextResponse.json(capability)
  } catch (err) {
    console.error('[capabilities PUT]', err)
    return NextResponse.json({ error: 'Failed to update capability.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const { id } = body as { id: string }

    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })

    await prisma.differentiatingCapability.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[capabilities DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete capability.' }, { status: 500 })
  }
}
