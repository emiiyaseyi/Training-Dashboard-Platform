import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { isBlankStaffId, hasMatchingIssue } from '@/lib/data-quality-audit'

// Fixes one flagged Data Quality Audit record in place, and optionally propagates the same fix
// to every other record in the same table that has the exact same issue. "Same" is judged by
// whichever identity is actually trustworthy on the OLD row:
//  - If the old Staff ID was already valid (not the upload-time "UNKNOWN_N" placeholder), other
//    rows are matched by that Staff ID — it's a real, stable identifier.
//  - If the old Staff ID was itself the missing/placeholder value (so it can't be trusted as a
//    match key — "UNKNOWN_N" is assigned per row, not per person, so two different people can
//    share one), matching falls back to the person's exact name instead. This is inherently
//    fuzzier (two different people can share a name), so the caller always gets a candidate
//    COUNT first and must explicitly confirm before anything beyond the one edited row is
//    touched — nothing is ever auto-applied silently.
// Feedback has no Staff ID at all, so it matches by the exact (old) Training Title instead, and
// only for propagating a Business Unit fix.
// The "does this OTHER record show the same issue" rule itself (hasMatchingIssue) is shared and
// unit-tested in src/lib/data-quality-audit.test.ts, rather than re-verified once per table here.

type Updates = Record<string, string>
interface FixResult { updated: number; similarCount: number; matchedBy?: 'staffId' | 'name' }

export async function PUT(req: NextRequest, { params }: { params: Promise<{ table: string; id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { table, id } = await params
  let body: { updates?: Updates; applyToSimilar?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const updates = body.updates || {}
  const applyToSimilar = !!body.applyToSimilar
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided.' }, { status: 400 })
  }

  try {
    let result: FixResult | { error: string }
    switch (table) {
      case 'training': result = await fixTraining(id, updates, applyToSimilar); break
      case 'subscription': result = await fixSubscription(id, updates, applyToSimilar); break
      case 'kss': result = await fixKSS(id, updates, applyToSimilar); break
      case 'manager-review': result = await fixManagerReview(id, updates, applyToSimilar); break
      case 'feedback': result = await fixFeedback(id, updates, applyToSimilar); break
      default: return NextResponse.json({ error: 'Unknown table.' }, { status: 400 })
    }
    if ('error' in result) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[admin/data-quality/${table}/${id} PUT]`, err)
    return NextResponse.json({ error: 'Failed to save fix.' }, { status: 500 })
  }
}

async function fixTraining(id: string, updates: Updates, applyToSimilar: boolean): Promise<FixResult | { error: string }> {
  const current = await prisma.trainingRecord.findUnique({ where: { id } })
  if (!current) return { error: 'Record not found.' }

  const data: { staffId?: string; businessUnit?: string; training?: string } = {}
  if (updates.staffId !== undefined) data.staffId = updates.staffId.trim().toUpperCase()
  if (updates.businessUnit !== undefined) data.businessUnit = normalizeBUName(updates.businessUnit.trim())
  if (updates.training !== undefined) data.training = updates.training.trim()
  if (Object.keys(data).length === 0) return { error: 'No recognised fields to update.' }

  await prisma.trainingRecord.update({ where: { id }, data })

  const matchByStaffId = !isBlankStaffId(current.staffId)
  const candidates = await prisma.trainingRecord.findMany({
    where: matchByStaffId ? { staffId: current.staffId } : { staffName: current.staffName },
    select: { id: true, staffId: true, businessUnit: true, training: true },
  })
  const similarIds = candidates
    .filter((c) => c.id !== id)
    .filter((c) => hasMatchingIssue(c, Object.keys(data)))
    .map((c) => c.id)

  if (!applyToSimilar || similarIds.length === 0) {
    return { updated: 1, similarCount: applyToSimilar ? 0 : similarIds.length, matchedBy: matchByStaffId ? 'staffId' : 'name' }
  }
  const result = await prisma.trainingRecord.updateMany({ where: { id: { in: similarIds } }, data })
  return { updated: 1 + result.count, similarCount: 0, matchedBy: matchByStaffId ? 'staffId' : 'name' }
}

async function fixSubscription(id: string, updates: Updates, applyToSimilar: boolean): Promise<FixResult | { error: string }> {
  const current = await prisma.subscriptionRecord.findUnique({ where: { id } })
  if (!current) return { error: 'Record not found.' }

  const data: { staffId?: string; businessUnit?: string; membershipOrg?: string } = {}
  if (updates.staffId !== undefined) data.staffId = updates.staffId.trim().toUpperCase()
  if (updates.businessUnit !== undefined) data.businessUnit = normalizeBUName(updates.businessUnit.trim())
  if (updates.membershipOrg !== undefined) data.membershipOrg = updates.membershipOrg.trim()
  if (Object.keys(data).length === 0) return { error: 'No recognised fields to update.' }

  await prisma.subscriptionRecord.update({ where: { id }, data })

  const matchByStaffId = !isBlankStaffId(current.staffId)
  const candidates = await prisma.subscriptionRecord.findMany({
    where: matchByStaffId ? { staffId: current.staffId } : { staffName: current.staffName },
    select: { id: true, staffId: true, businessUnit: true, membershipOrg: true },
  })
  const similarIds = candidates
    .filter((c) => c.id !== id)
    .filter((c) => hasMatchingIssue(c, Object.keys(data)))
    .map((c) => c.id)

  if (!applyToSimilar || similarIds.length === 0) {
    return { updated: 1, similarCount: applyToSimilar ? 0 : similarIds.length, matchedBy: matchByStaffId ? 'staffId' : 'name' }
  }
  const result = await prisma.subscriptionRecord.updateMany({ where: { id: { in: similarIds } }, data })
  return { updated: 1 + result.count, similarCount: 0, matchedBy: matchByStaffId ? 'staffId' : 'name' }
}

async function fixKSS(id: string, updates: Updates, applyToSimilar: boolean): Promise<FixResult | { error: string }> {
  const current = await prisma.kSSRecord.findUnique({ where: { id } })
  if (!current) return { error: 'Record not found.' }

  const data: { staffId?: string; businessUnit?: string } = {}
  if (updates.staffId !== undefined) data.staffId = updates.staffId.trim().toUpperCase()
  if (updates.businessUnit !== undefined) data.businessUnit = normalizeBUName(updates.businessUnit.trim())
  if (Object.keys(data).length === 0) return { error: 'No recognised fields to update.' }

  await prisma.kSSRecord.update({ where: { id }, data })

  const matchByStaffId = !isBlankStaffId(current.staffId)
  const candidates = await prisma.kSSRecord.findMany({
    where: matchByStaffId ? { staffId: current.staffId } : { staffName: current.staffName },
    select: { id: true, staffId: true, businessUnit: true },
  })
  const similarIds = candidates
    .filter((c) => c.id !== id)
    .filter((c) => hasMatchingIssue(c, Object.keys(data)))
    .map((c) => c.id)

  if (!applyToSimilar || similarIds.length === 0) {
    return { updated: 1, similarCount: applyToSimilar ? 0 : similarIds.length, matchedBy: matchByStaffId ? 'staffId' : 'name' }
  }
  const result = await prisma.kSSRecord.updateMany({ where: { id: { in: similarIds } }, data })
  return { updated: 1 + result.count, similarCount: 0, matchedBy: matchByStaffId ? 'staffId' : 'name' }
}

async function fixManagerReview(id: string, updates: Updates, applyToSimilar: boolean): Promise<FixResult | { error: string }> {
  const current = await prisma.managerReviewRecord.findUnique({ where: { id } })
  if (!current) return { error: 'Record not found.' }

  const data: { staffId?: string; businessUnit?: string } = {}
  if (updates.staffId !== undefined) data.staffId = updates.staffId.trim().toUpperCase()
  if (updates.businessUnit !== undefined) data.businessUnit = normalizeBUName(updates.businessUnit.trim())
  if (Object.keys(data).length === 0) return { error: 'No recognised fields to update.' }

  await prisma.managerReviewRecord.update({ where: { id }, data })

  const matchByStaffId = !isBlankStaffId(current.staffId)
  const candidates = await prisma.managerReviewRecord.findMany({
    where: matchByStaffId ? { staffId: current.staffId } : { staffName: current.staffName },
    select: { id: true, staffId: true, businessUnit: true },
  })
  const similarIds = candidates
    .filter((c) => c.id !== id)
    .filter((c) => hasMatchingIssue(c, Object.keys(data)))
    .map((c) => c.id)

  if (!applyToSimilar || similarIds.length === 0) {
    return { updated: 1, similarCount: applyToSimilar ? 0 : similarIds.length, matchedBy: matchByStaffId ? 'staffId' : 'name' }
  }
  const result = await prisma.managerReviewRecord.updateMany({ where: { id: { in: similarIds } }, data })
  return { updated: 1 + result.count, similarCount: 0, matchedBy: matchByStaffId ? 'staffId' : 'name' }
}

// FeedbackRecord has no Staff ID at all, so the only safe match key is the exact (old) Training
// Title — used only to propagate a Business Unit fix onto other feedback rows for that same
// training that are also missing it.
async function fixFeedback(id: string, updates: Updates, applyToSimilar: boolean): Promise<FixResult | { error: string }> {
  const current = await prisma.feedbackRecord.findUnique({ where: { id } })
  if (!current) return { error: 'Record not found.' }

  const data: { businessUnit?: string; trainingTitle?: string } = {}
  if (updates.businessUnit !== undefined) data.businessUnit = normalizeBUName(updates.businessUnit.trim())
  if (updates.trainingTitle !== undefined) data.trainingTitle = updates.trainingTitle.trim()
  if (Object.keys(data).length === 0) return { error: 'No recognised fields to update.' }

  await prisma.feedbackRecord.update({ where: { id }, data })

  if (!current.trainingTitle || data.businessUnit === undefined) return { updated: 1, similarCount: 0 }

  const candidates = await prisma.feedbackRecord.findMany({
    where: { trainingTitle: current.trainingTitle },
    select: { id: true, businessUnit: true },
  })
  const similarIds = candidates
    .filter((c) => c.id !== id)
    .filter((c) => hasMatchingIssue(c, ['businessUnit']))
    .map((c) => c.id)

  if (!applyToSimilar || similarIds.length === 0) {
    return { updated: 1, similarCount: applyToSimilar ? 0 : similarIds.length }
  }
  const result = await prisma.feedbackRecord.updateMany({ where: { id: { in: similarIds } }, data: { businessUnit: data.businessUnit } })
  return { updated: 1 + result.count, similarCount: 0 }
}
