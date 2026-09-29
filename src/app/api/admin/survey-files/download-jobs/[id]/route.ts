import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Streams back the already-built zip for a completed job — "Redownload" in Download History uses
// this, never rebuilding anything.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const job = await prisma.fileDownloadJob.findUnique({ where: { id } })
  if (!job) return NextResponse.json({ error: 'Download not found.' }, { status: 404 })
  if (job.status !== 'completed' || !job.zipData) {
    return NextResponse.json({ error: job.status === 'failed' ? (job.errorMessage || 'This download failed.') : 'This download is still in progress.' }, { status: 400 })
  }

  const safeName = (job.zipFileName || 'download.zip').replace(/[\r\n"]/g, '_')
  return new NextResponse(new Uint8Array(job.zipData), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(job.zipData.length),
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  await prisma.fileDownloadJob.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ success: true })
}
