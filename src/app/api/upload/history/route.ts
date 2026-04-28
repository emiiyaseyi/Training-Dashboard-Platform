import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const batches = await prisma.uploadBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json(batches)
  } catch (err) {
    console.error('[upload/history]', err)
    return NextResponse.json({ error: 'Failed to fetch upload history.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })

    await prisma.uploadBatch.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[upload/history DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete batch.' }, { status: 500 })
  }
}
