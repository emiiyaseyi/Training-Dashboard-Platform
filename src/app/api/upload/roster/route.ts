import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseRosterExcel } from '@/lib/excel-parser'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { requirePermission } from '@/lib/session-guard'
import { validateUploadFile } from '@/lib/upload-validation'

export async function POST(req: NextRequest) {
  const gate = await requirePermission('upload-data', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const period = (formData.get('period') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    const fileError = validateUploadFile(file)
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors, warnings } = parseRosterExcel(buffer)

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' '), warnings }, { status: 422 })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File parsed but contained no valid rows.', warnings }, { status: 422 })
    }

    const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))

    const buNames = [...new Set(normalizedRows.map((r) => r.businessUnit).filter(Boolean))]
    for (const name of buNames) {
      await prisma.businessUnit.upsert({
        where: { name },
        update: {},
        create: { name, budget: 0, staffCount: 0 },
      })
    }

    const batch = await prisma.uploadBatch.create({
      data: {
        type: 'roster',
        filename: file.name,
        recordCount: normalizedRows.length,
        period: period || null,
      },
    })

    await prisma.staffRosterRecord.createMany({
      data: normalizedRows.map((r) => ({
        staffId:        r.staffId.toUpperCase(),
        firstName:      r.firstName,
        middleName:     r.middleName || null,
        lastName:       r.lastName,
        email:          r.email || null,
        lineManagerStaffId: r.lineManagerStaffId || null,
        businessUnit:   r.businessUnit,
        role:           r.role || null,
        department:     r.department || null,
        employmentDate: r.employmentDate ? new Date(r.employmentDate) : null,
        confirmed:      r.confirmed,
        batchId:        batch.id,
      })),
    })

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      recordCount: normalizedRows.length,
      warnings,
    })
  } catch (err) {
    console.error('[upload/roster]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
