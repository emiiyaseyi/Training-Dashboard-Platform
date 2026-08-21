import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  try {
    const vendors = await prisma.vendor.findMany({ orderBy: { order: 'asc' } })
    return NextResponse.json(vendors)
  } catch (err) {
    console.error('[vendors GET]', err)
    return NextResponse.json({ error: 'Failed to fetch vendors.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { name, order } = body as { name: string; order?: number }

    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })

    const vendor = await prisma.vendor.upsert({
      where: { name },
      update: { order: order ?? 0 },
      create: { name, order: order ?? 0 },
    })

    return NextResponse.json(vendor)
  } catch (err) {
    console.error('[vendors POST]', err)
    return NextResponse.json({ error: 'Failed to save vendor.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { id, name, order } = body as { id: string; name: string; order?: number }

    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })

    const vendor = await prisma.vendor.update({
      where: { id },
      data: { name, order: order ?? 0 },
    })

    return NextResponse.json(vendor)
  } catch (err) {
    console.error('[vendors PUT]', err)
    return NextResponse.json({ error: 'Failed to update vendor.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { id } = body as { id: string }

    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })

    await prisma.vendor.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[vendors DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete vendor.' }, { status: 500 })
  }
}
