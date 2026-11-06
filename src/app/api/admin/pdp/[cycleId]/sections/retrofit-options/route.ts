import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { ROLE_RESPONSIBILITY_CATEGORIES, DEVELOPMENT_DRIVER_OPTIONS, BUSINESS_OUTCOME_OPTIONS } from '@/lib/pdp-seed'

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
  { sectionKey: 'role_alignment', label: 'Relevant Business Outcome', options: BUSINESS_OUTCOME_OPTIONS },
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

  // Unlike the options retrofit above (which only overwrites an existing question's `options`),
  // a cycle seeded before these questions existed in PDP_DEFAULT_SECTIONS has no row for them at
  // all — this inserts whichever are missing, each positioned right after a named anchor question
  // (matching where PDP_DEFAULT_SECTIONS now puts them), shifting every later question in the
  // section down by one `order` slot. Applied in order, each against a fresh read, so this works
  // whether a cycle is missing one of these or both (e.g. already retrofitted for the first one on
  // an earlier click). Never touches any already-submitted answer (those live on
  // PDPStaffSurvey.answers/PDPManagerTeamMemberEntry.answers, keyed by question id — an answer for
  // a question that didn't exist for this respondent simply doesn't exist, same as any other
  // question added to a cycle after some respondents already started).
  const INSERTIONS: { afterLabel: string; label: string; description: string; type: string; required: boolean; searchable: boolean; options: string[] }[] = [
    {
      afterLabel: 'Priority',
      label: 'Proposed Training Title',
      description: 'Pick one of the suggested titles below, edit it, or enter a different one.',
      type: 'select',
      required: false,
      searchable: true,
      options: [],
    },
    {
      afterLabel: 'Proposed Training Title',
      label: 'Current Knowledge Level on This Topic',
      description: 'Where you are today on the proposed training title above, before the intervention.',
      type: 'select',
      required: true,
      searchable: false,
      options: ['No knowledge', 'Beginner', 'Intermediate', 'Advanced'],
    },
  ]
  const addedQuestions: string[] = []
  for (const insertion of INSERTIONS) {
    const needsSection = await prisma.pDPSection.findFirst({ where: { cycleId, key: 'development_needs' }, include: { questions: true } })
    if (!needsSection || needsSection.questions.some((q) => q.label === insertion.label)) continue
    const anchor = needsSection.questions.find((q) => q.label === insertion.afterLabel)
    if (!anchor) continue
    const toShift = needsSection.questions.filter((q) => q.order > anchor.order)
    await prisma.$transaction([
      ...toShift.map((q) => prisma.pDPQuestion.update({ where: { id: q.id }, data: { order: q.order + 1 } })),
      prisma.pDPQuestion.create({
        data: {
          cycleId,
          sectionId: needsSection.id,
          order: anchor.order + 1,
          label: insertion.label,
          description: insertion.description,
          type: insertion.type,
          required: insertion.required,
          searchable: insertion.searchable,
          options: JSON.stringify(insertion.options),
        },
      }),
    ])
    addedQuestions.push(insertion.label)
  }

  await prisma.$transaction(
    updates.map((u) => prisma.pDPQuestion.update({ where: { id: u.id }, data: { options: u.options } }))
  )

  return NextResponse.json({ success: true, count: updates.length, addedQuestions })
}
