import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { buildUploadedFileName, looksAlreadyRenamed } from '@/lib/uploaded-file-naming'

// One-time (safely re-runnable) rename of every UploadedFile created before the "Staff Name -
// Training Name - Training Date - original file name" convention existed, so old uploads read
// the same way as new ones instead of just showing their bare original filename.
//
// A "survey" (training) row has no direct link to the exact TrainingSchedule it came from — only
// surveyName + businessUnit, both denormalized — so for a training run more than once under the
// same name/BU this is a best-effort match: whichever schedule's startDate is closest to the
// file's upload date. A "custom-survey" row gets no date at all (CustomSurvey isn't reliably
// single-dated), same as a fresh upload today.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const rows = await prisma.uploadedFile.findMany({
    select: { id: true, source: true, surveyName: true, businessUnit: true, fileName: true, uploaderName: true, createdAt: true },
  })

  let renamed = 0
  let skippedNoUploader = 0

  for (const f of rows) {
    if (!f.uploaderName) { skippedNoUploader++; continue }
    if (looksAlreadyRenamed(f.fileName, f.uploaderName, f.surveyName)) continue

    let trainingDate: Date | null = null
    if (f.source === 'survey') {
      const candidates = await prisma.trainingSchedule.findMany({
        where: { trainingName: f.surveyName, ...(f.businessUnit ? { businessUnit: f.businessUnit } : {}) },
        select: { startDate: true },
      })
      if (candidates.length > 0) {
        const uploadedAt = f.createdAt.getTime()
        candidates.sort((a, b) => Math.abs(a.startDate.getTime() - uploadedAt) - Math.abs(b.startDate.getTime() - uploadedAt))
        trainingDate = candidates[0].startDate
      }
    }

    const newFileName = buildUploadedFileName(f.uploaderName, f.surveyName, trainingDate, f.fileName)
    await prisma.uploadedFile.update({ where: { id: f.id }, data: { fileName: newFileName } })
    renamed++
  }

  return NextResponse.json({ total: rows.length, renamed, skippedNoUploader })
}
