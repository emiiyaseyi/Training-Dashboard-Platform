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

// Business Unit names and (especially) survey question labels routinely contain characters
// Windows forbids in a file/folder name — a colon or question mark in something like "Rate your
// experience: 1-5?" is completely ordinary text but breaks Explorer's built-in unzip with exactly
// this "destination file could not be created" error, independent of path length. Replaced with a
// space rather than dropped, so "Before: vs After:" doesn't collapse into "Before After" and stay
// readable. Also strips a trailing dot/space, which Windows rejects on a folder name even though
// it's otherwise legal — something truncation below can introduce by cutting mid-word.
const WINDOWS_ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1F]/g
function sanitizeSegment(s: string): string {
  return s.replace(WINDOWS_ILLEGAL_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'Untitled'
}

// Windows' extractor refuses to unpack a path over ~260 characters (MAX_PATH) — same reasoning as
// the client-side zip this replaces (see UploadedFilesPanel.tsx).
function truncateSegment(s: string, maxLen: number): string {
  const clean = sanitizeSegment(s)
  const trimmed = clean.length > maxLen ? clean.slice(0, maxLen).trim().replace(/[. ]+$/, '') : clean
  return trimmed || 'Untitled'
}
function truncateFileName(name: string, maxLen: number): string {
  const dot = name.lastIndexOf('.')
  const rawExt = dot > -1 ? name.slice(dot + 1) : '' // extension WITHOUT the leading dot
  const rawBase = dot > -1 ? name.slice(0, dot) : name
  const extClean = rawExt ? sanitizeSegment(rawExt) : ''
  const ext = extClean && extClean !== 'Untitled' ? `.${extClean}` : ''
  const base = sanitizeSegment(rawBase) || 'file'
  const full = `${base}${ext}`
  if (full.length <= maxLen) return full
  const truncatedBase = base.slice(0, Math.max(10, maxLen - ext.length)).trim().replace(/[. ]+$/, '')
  return `${truncatedBase || 'file'}${ext}`
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
          `${truncateSegment(f.businessUnit || 'Custom Surveys - No Business Unit', 30)}/${truncateSegment(f.questionLabel, 30)}/${truncateFileName(f.fileName, 120)}`,
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
