import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { ROLE_RESPONSIBILITY_CATEGORIES, DEVELOPMENT_DRIVER_OPTIONS } from '@/lib/pdp-seed'

// A question's option list only ever lives in PDP_DEFAULT_SECTIONS at seed time — editing that
// array (e.g. broadening "Primary Role Responsibilities" to cover more departments) has no effect
// on a cycle that was already seeded before the edit, same gap "Reset to recommended order" exists
// to close for section ORDER. This is the equivalent for a question's OPTIONS: matches by
// (section key, question label) and overwrites just that question's `options`, never touching
// anyone's already-submitted answers (those live on PDPStaffSurvey/PDPManagerTeamMemberEntry, not
// on the question definition) or any other field (type, required, searchable, maxSelect, order).
const RETROFITS: { sectionKey: string; label: string; options: string[] }[] = [
  { sectionKey: 'role_alignment', label: 'Primary Role Responsibilities', options: ROLE_RESPONSIBILITY_CATEGORIES },
  { sectionKey: 'role_alignment', label: 'Primary Development Driver', options: DEVELOPMENT_DRIVER_OPTIONS },
  { sectionKey: 'role_alignment', label: 'Secondary Development Driver', options: DEVELOPMENT_DRIVER_OPTIONS },
  {
    sectionKey: 'role_alignment',
    label: 'Relevant Business Outcome',
    options: [
      'Revenue growth and business development',
      'Customer experience and client satisfaction',
      'Operational efficiency and productivity',
      'Quality, accuracy and turnaround time',
      'Risk management and regulatory compliance',
      'Digital adoption, automation and innovation',
      'Strategic execution and business performance',
      'Employee capability and team effectiveness',
      'Financial control, accuracy and reporting integrity',
      'Client trust, retention and relationship strength',
      'Other',
    ],
  },
  { sectionKey: 'development_needs', label: 'Skill or capability area', options: ROLE_RESPONSIBILITY_CATEGORIES },
]

export async function POST(_req: Request, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const sections = await prisma.pDPSection.findMany({ where: { cycleId }, include: { questions: true } })

  const updates: { id: string; options: string }[] = []
  for (const retrofit of RETROFITS) {
    const section = sections.find((s) => s.key === retrofit.sectionKey)
    const question = section?.questions.find((q) => q.label === retrofit.label)
    if (question) updates.push({ id: question.id, options: JSON.stringify(retrofit.options) })
  }

  await prisma.$transaction(
    updates.map((u) => prisma.pDPQuestion.update({ where: { id: u.id }, data: { options: u.options } }))
  )

  return NextResponse.json({ success: true, count: updates.length })
}
