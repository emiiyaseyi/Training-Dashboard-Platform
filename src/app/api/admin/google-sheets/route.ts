import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { hasServiceAccountCredentials, serviceAccountEmail, privateKeyDiagnostics } from '@/lib/google-sheets'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const config = await prisma.googleSheetsConfig.findFirst()
  return NextResponse.json({
    ...config,
    lastSyncErrors: config?.lastSyncErrors ? JSON.parse(config.lastSyncErrors) : [],
    serverHasCredentials: hasServiceAccountCredentials(),
    serviceAccountEmail: serviceAccountEmail(),
    privateKeyDiagnostics: privateKeyDiagnostics(),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const data = {
      spreadsheetUrl: body.spreadsheetUrl ?? null,
      trainingSheetName: body.trainingSheetName || 'Training Cost',
      feedbackSheetName: body.feedbackSheetName || 'Feedback',
      subscriptionSheetName: body.subscriptionSheetName || 'Subscriptions',
      kssSheetName: body.kssSheetName || 'KSS',
      rosterSheetName: body.rosterSheetName || null,
      comprehensiveStaffListSheetName: body.comprehensiveStaffListSheetName || null,
      talentMemberSheetName: body.talentMemberSheetName || null,
      autoSyncEnabled: !!body.autoSyncEnabled,
      syncFrequencyMinutes: body.syncFrequencyMinutes ? parseInt(body.syncFrequencyMinutes) : 60,
    }

    const existing = await prisma.googleSheetsConfig.findFirst()
    const updated = existing
      ? await prisma.googleSheetsConfig.update({ where: { id: existing.id }, data })
      : await prisma.googleSheetsConfig.create({ data })

    invalidateComprehensiveStaffListCache()
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[admin/google-sheets POST]', err)
    return NextResponse.json({ error: 'Failed to save Google Sheets settings.' }, { status: 500 })
  }
}
