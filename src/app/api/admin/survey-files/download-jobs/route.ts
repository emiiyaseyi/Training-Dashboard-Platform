import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// A "Download Selected" job — see FileDownloadJob in schema.prisma for why this exists as its own
// DB-backed record instead of a client-side zip. Headroom beyond Vercel's default so a large
// selection (dozens of files' worth of DB reads + compression) can actually finish server-side
// instead of timing out — capped well under the platform's own hard limit either way.
export const maxDuration = 60

interface ZipEntryLike { name: string; blob: Blob }

async function buildZip(entries: ZipEntryLike[]): Promise<Buffer> {
  const JSZipMod = await import('jszip')
  const JSZip = JSZipMod.default ?? JSZipMod
  const zip = new JSZip()
  for (const e of entries) zip.file(e.name, Buffer.from(await e.blob.arrayBuffer()))
  return zip.generateAsync({ type: 'nodebuffer' })
}

// Windows' extractor refuses to unpack a path over ~260 characters (MAX_PATH) — same reasoning as
// the client-side zip this replaces (see UploadedFilesPanel.tsx).
function truncateSegment(s: string, maxLen: number): string {
  const trimmed = s.trim()
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed
}
function truncateFileName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > -1 ? name.slice(dot) : ''
  const base = dot > -1 ? name.slice(0, dot) : name
  return `${base.slice(0, Math.max(10, maxLen - ext.length))}${ext}`
}
function uniqueZipPath(path: string, used: Map<string, number>): string {
  const count = used.get(path) || 0
  used.set(path, count + 1)
  if (count === 0) return path
  const dot = path.lastIndexOf('.')
  return dot === -1 ? `${path} (${count})` : `${path.slice(0, dot)} (${count})${path.slice(dot)}`
}

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const jobs = await prisma.fileDownloadJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, requestedBy: true, fileCount: true, status: true, zipFileName: true, errorMessage: true, createdAt: true, completedAt: true },
  })
  return NextResponse.json(jobs)
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const { fileIds } = (await req.json()) as { fileIds?: string[] }
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: 'fileIds is required.' }, { status: 400 })
    }

    const files = await prisma.uploadedFile.findMany({ where: { id: { in: fileIds } } })
    const job = await prisma.fileDownloadJob.create({
      data: { requestedBy: gate.user.email || gate.user.name || null, fileCount: files.length, status: 'processing' },
    })

    try {
      const used = new Map<string, number>()
      const entries = files.map((f) => ({
        name: uniqueZipPath(
          `${truncateSegment(f.businessUnit || 'Custom Surveys / No Business Unit', 30)}/${truncateSegment(f.questionLabel, 30)}/${truncateFileName(f.fileName, 120)}`,
          used
        ),
        blob: new Blob([new Uint8Array(f.data)], { type: f.mimeType || 'application/octet-stream' }),
      }))
      const zipBuffer = await buildZip(entries)
      const zipFileName = `uploaded-files-${new Date().toISOString().slice(0, 10)}.zip`

      const completed = await prisma.fileDownloadJob.update({
        where: { id: job.id },
        data: { status: 'completed', zipFileName, zipData: zipBuffer, completedAt: new Date() },
        select: { id: true, requestedBy: true, fileCount: true, status: true, zipFileName: true, errorMessage: true, createdAt: true, completedAt: true },
      })
      return NextResponse.json(completed)
    } catch (zipErr) {
      const message = zipErr instanceof Error ? zipErr.message : 'Failed to build the zip.'
      const failed = await prisma.fileDownloadJob.update({
        where: { id: job.id },
        data: { status: 'failed', errorMessage: message },
        select: { id: true, requestedBy: true, fileCount: true, status: true, zipFileName: true, errorMessage: true, createdAt: true, completedAt: true },
      })
      return NextResponse.json(failed)
    }
  } catch (err) {
    console.error('[admin/survey-files/download-jobs POST]', err)
    return NextResponse.json({ error: 'Failed to start the download.' }, { status: 500 })
  }
}
