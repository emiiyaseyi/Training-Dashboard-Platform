import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Metadata only — never selects `data` (the file bytes), which can be sizable per row and is
// only ever needed by the single-file download route below.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const files = await prisma.uploadedFile.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      source: true,
      surveyName: true,
      stage: true,
      questionLabel: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      uploaderStaffId: true,
      uploaderName: true,
      createdAt: true,
    },
  })
  return NextResponse.json(files)
}
