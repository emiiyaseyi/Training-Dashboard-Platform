import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { PDP_DEFAULT_EMAIL_TEMPLATES, PDP_EMAIL_TOKENS, type PDPEmailKind } from '@/lib/pdp-email'

const KINDS: PDPEmailKind[] = ['staffSurvey', 'managerValidation', 'managerTeam']

// Returns all three PDP email templates for this cycle — a customized row where an admin has
// saved one, the built-in default otherwise, plus which tokens each kind supports and whether the
// current value is the default (so the UI can show a "customized" badge and a reset option).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'view')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const rows = await prisma.pDPEmailTemplate.findMany({ where: { cycleId } })
  const byKind = new Map(rows.map((r) => [r.kind, r]))

  const templates = KINDS.map((kind) => {
    const row = byKind.get(kind)
    const value = row
      ? { subject: row.subject, body: row.body, buttonLabel: row.buttonLabel, showFallbackLink: row.showFallbackLink }
      : PDP_DEFAULT_EMAIL_TEMPLATES[kind]
    return { kind, ...value, isCustomized: !!row, tokens: PDP_EMAIL_TOKENS[kind] }
  })

  return NextResponse.json({ templates })
}
