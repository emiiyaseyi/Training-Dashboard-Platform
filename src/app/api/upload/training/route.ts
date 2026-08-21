import { NextRequest, NextResponse } from 'next/server'
import { parseTrainingExcel } from '@/lib/excel-parser'
import { importTrainingRows } from '@/lib/import-records'
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
    const { rows, errors, warnings } = parseTrainingExcel(buffer)

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' '), warnings }, { status: 422 })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File parsed but contained no valid rows.', warnings }, { status: 422 })
    }

    const result = await importTrainingRows(rows, file.name, period || null, warnings)

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      recordCount: result.recordCount,
      warnings: result.warnings,
    })
  } catch (err) {
    console.error('[upload/training]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
