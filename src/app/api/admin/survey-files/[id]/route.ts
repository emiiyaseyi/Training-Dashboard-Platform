import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Streams the raw file back for download — the only place `UploadedFile.data` is ever read.
// Session-gated (not token-gated like the public survey routes): these are documents attached to
// a specific person's survey response, so only an authenticated admin can fetch one, by its
// unguessable cuid id (never listed to or reachable by the respondent who uploaded it).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const { id } = await params
  const file = await prisma.uploadedFile.findUnique({ where: { id } })
  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })

  const safeName = file.fileName.replace(/[\r\n"]/g, '_')
  return new NextResponse(file.data, {
    headers: {
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'Content-Length': String(file.fileSize),
    },
  })
}
