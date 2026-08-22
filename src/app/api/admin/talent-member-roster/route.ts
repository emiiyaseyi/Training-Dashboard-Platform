import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaffLoose } from '@/lib/staff-directory'
import { mirrorRosterEntryToSheet } from '@/lib/talent-member-roster-mirror'

export async function GET() {
  const gate = await requirePermission('talent-members', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const entries = await prisma.talentMemberRosterEntry.findMany({ orderBy: { createdAt: 'desc' } })
    const directory = await loadRosterDirectory()
    return NextResponse.json(
      entries.map((e) => {
        const match = e.staffId || e.name || e.email ? resolveStaffLoose(e.staffId || e.name || e.email || '', directory) : null
        return {
          id: e.id,
          staffId: e.staffId,
          name: e.name,
          email: e.email,
          resolvedName: match?.name ?? null,
          businessUnit: match?.businessUnit ?? null,
          resolved: !!match,
          sheetSyncedAt: e.sheetSyncedAt,
          sheetSyncError: e.sheetSyncError,
        }
      })
    )
  } catch (err) {
    console.error('[admin/talent-member-roster GET]', err)
    return NextResponse.json({ error: 'Failed to fetch Talent Member roster.' }, { status: 500 })
  }
}

// Accepts either a single identifier ({ staffId } or { name } or { email }) for the individual
// form, or { identifiers: string[] } for bulk paste — each bulk line is one loose identifier
// (name, Staff ID, or email; which one it is gets sorted out by resolveStaffLoose when the
// report is computed, not here). Every added entry is mirrored to the configured sheet.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { staffId, name, email, identifiers } = body as {
      staffId?: string; name?: string; email?: string; identifiers?: string[]
    }

    const toCreate: { staffId: string | null; name: string | null; email: string | null }[] = []

    if (Array.isArray(identifiers)) {
      for (const raw of identifiers) {
        const trimmed = raw.trim()
        if (!trimmed) continue
        // Loose classification for storage only — the actual match happens via resolveStaffLoose
        // at read time, this just decides which column to put the typed value in.
        if (/@/.test(trimmed)) toCreate.push({ staffId: null, name: null, email: trimmed.toLowerCase() })
        else if (/^[a-z0-9-]+$/i.test(trimmed) && /\d/.test(trimmed)) toCreate.push({ staffId: trimmed, name: null, email: null })
        else toCreate.push({ staffId: null, name: trimmed, email: null })
      }
    } else {
      if (!staffId?.trim() && !name?.trim() && !email?.trim()) {
        return NextResponse.json({ error: 'Enter a name, Staff ID, or email.' }, { status: 400 })
      }
      toCreate.push({ staffId: staffId?.trim() || null, name: name?.trim() || null, email: email?.trim().toLowerCase() || null })
    }

    if (toCreate.length === 0) {
      return NextResponse.json({ error: 'Nothing to add.' }, { status: 400 })
    }

    const created = await prisma.$transaction(toCreate.map((data) => prisma.talentMemberRosterEntry.create({ data })))

    for (const entry of created) {
      const result = await mirrorRosterEntryToSheet(entry)
      if (result.attempted) {
        await prisma.talentMemberRosterEntry.update({
          where: { id: entry.id },
          data: { sheetSyncedAt: result.success ? new Date() : null, sheetSyncError: result.success ? null : result.message },
        })
      }
    }

    return NextResponse.json({ added: created.length })
  } catch (err) {
    console.error('[admin/talent-member-roster POST]', err)
    return NextResponse.json({ error: 'Failed to add to Talent Member roster.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await req.json() as { id: string }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    await prisma.talentMemberRosterEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/talent-member-roster DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove roster entry.' }, { status: 500 })
  }
}
