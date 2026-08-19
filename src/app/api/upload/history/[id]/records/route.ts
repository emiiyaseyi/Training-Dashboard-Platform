import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Returns a batch's records reshaped back into the original upload column names, so the
// Upload History page can offer a "download what was uploaded" button per batch.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const batch = await prisma.uploadBatch.findUnique({ where: { id } })
    if (!batch) return NextResponse.json({ error: 'Upload batch not found.' }, { status: 404 })

    let rows: Record<string, unknown>[] = []

    if (batch.type === 'training') {
      const records = await prisma.trainingRecord.findMany({ where: { batchId: id } })
      rows = records.map((r) => ({
        'S/N': r.serialNo ?? '',
        Name: r.staffName,
        'Staff ID': r.staffId,
        Training: r.training,
        'Business Units': r.businessUnit,
        Month: r.month,
        Cost: r.cost,
        'Learning Hours': r.hours ?? '',
        'Training Type': r.trainingType ?? '',
        'Differentiating Capability': r.capability ?? '',
      }))
    } else if (batch.type === 'feedback') {
      const records = await prisma.feedbackRecord.findMany({ where: { batchId: id } })
      rows = records.map((r) => ({
        'Business Unit': r.businessUnit,
        'Training Title': r.trainingTitle,
        Role: r.role ?? '',
        Month: r.month ?? '',
        'Application response': r.applicationResponse ?? '',
        'Impact alignment': r.impactAlignment ?? '',
        'Confidence rating': r.confidenceRating ?? '',
        'Role Relevance': r.roleRelevance ?? '',
        'Expectations Met': r.expectationsMet ?? '',
        'Vendor Rating': r.vendorRating ?? '',
        'Vendor Name': r.vendorName ?? '',
        'Qualitative responses': r.qualitativeResponse ?? '',
      }))
    } else if (batch.type === 'subscription') {
      const records = await prisma.subscriptionRecord.findMany({ where: { batchId: id } })
      rows = records.map((r) => ({
        Month: r.month ?? '',
        'Staff ID': r.staffId,
        Name: r.staffName,
        'Business Unit': r.businessUnit,
        'Membership Organization': r.membershipOrg,
        Amount: r.amount,
      }))
    } else if (batch.type === 'kss') {
      const records = await prisma.kSSRecord.findMany({ where: { batchId: id } })
      rows = records.map((r) => ({
        'Staff ID': r.staffId,
        Name: r.staffName,
        'Business Unit': r.businessUnit,
        'In-Meeting Duration (minutes)': r.durationMinutes,
        Month: r.month ?? '',
      }))
    } else if (batch.type === 'roster') {
      const records = await prisma.staffRosterRecord.findMany({ where: { batchId: id } })
      rows = records.map((r) => ({
        'Staff ID': r.staffId,
        'First Name': r.firstName,
        'Middle Name': r.middleName ?? '',
        'Last Name': r.lastName,
        'Business Unit': r.businessUnit,
        Role: r.role ?? '',
        Department: r.department ?? '',
        'Employment Date': r.employmentDate ? r.employmentDate.toISOString().slice(0, 10) : '',
        'Confirmation Status': r.confirmed ? 'Yes' : 'No',
      }))
    } else if (batch.type === 'manager-review') {
      const records = await prisma.managerReviewRecord.findMany({ where: { batchId: id } })
      rows = records.map((r) => ({
        'Staff ID': r.staffId,
        Name: r.staffName,
        'Business Unit': r.businessUnit,
        Training: r.training,
        'Manager Name': r.managerName ?? '',
        'Impact Score': r.impactScore,
        Comments: r.comments ?? '',
        Month: r.month ?? '',
      }))
    } else {
      return NextResponse.json({ error: `Unknown batch type "${batch.type}".` }, { status: 400 })
    }

    return NextResponse.json({ filename: batch.filename, type: batch.type, rows })
  } catch (err) {
    console.error('[upload/history/[id]/records GET]', err)
    return NextResponse.json({ error: 'Failed to fetch batch records.' }, { status: 500 })
  }
}
