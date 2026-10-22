import { prisma } from './prisma'
import { PDP_DEFAULT_EMAIL_TEMPLATES, type PDPEmailKind, type PDPEmailTemplateData } from './pdp-email'

// The one place every PDP email send looks up its copy — a customized PDPEmailTemplate row for
// this (cycle, kind) if an admin has saved one, else the built-in default. Callers never read
// PDP_DEFAULT_EMAIL_TEMPLATES directly for a real send, only this resolver, so "no hardcoding"
// holds even though a sane default still ships with the app.
export async function resolvePDPEmailTemplate(cycleId: string, kind: PDPEmailKind): Promise<PDPEmailTemplateData> {
  const row = await prisma.pDPEmailTemplate.findUnique({ where: { cycleId_kind: { cycleId, kind } } })
  if (!row) return PDP_DEFAULT_EMAIL_TEMPLATES[kind]
  return { subject: row.subject, body: row.body, buttonLabel: row.buttonLabel, showFallbackLink: row.showFallbackLink }
}
