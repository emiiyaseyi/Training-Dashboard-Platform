import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { resolveRespondentSections } from '@/lib/pdp-form'

interface Answers { answers: Record<string, string | string[]>; developmentNeeds: Record<string, string | string[]>[] }

function parseAnswers(raw: string | null): Answers | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Answers>
    return { answers: parsed.answers || {}, developmentNeeds: parsed.developmentNeeds || [] }
  } catch {
    return null
  }
}

// One finalized plan per person — a manager's edited/accepted version where one exists (Track A,
// validated), otherwise the person's own submission (Track A, not yet validated, or Track B,
// manager-filled directly) — never both, so nobody is double-counted.
interface FinalizedPlan {
  staffId: string
  staffName: string
  businessUnit: string
  department: string | null
  source: string
  answers: Answers
}

// Generic, section/question-driven aggregation — works against whatever sections/questions this
// cycle currently has (admin-editable), not a hardcoded field list. For every select/multiselect
// question, counts how often each option was picked, across all finalized plans, broken down by
// Business Unit and Department as well as the organisation-wide total — directly usable as the
// "what does the organisation need, and where" view behind a training plan, per the admin's ask.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'view')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const [staffSurveys, managerSurveys, sections] = await Promise.all([
    prisma.pDPStaffSurvey.findMany({ where: { cycleId }, include: { validations: true } }),
    prisma.pDPManagerSurvey.findMany({ where: { cycleId }, include: { teamMembers: true } }),
    resolveRespondentSections(cycleId),
  ])

  const plans: FinalizedPlan[] = []
  for (const s of staffSurveys) {
    const completedValidation = s.validations.find((v) => v.respondedAt && v.editedAnswers)
    const answers = completedValidation ? parseAnswers(completedValidation.editedAnswers) : parseAnswers(s.answers)
    if (!answers) continue
    plans.push({
      staffId: s.staffId, staffName: s.staffName, businessUnit: s.businessUnit || 'Unassigned', department: s.department,
      source: completedValidation ? `Self-Fill, validated by ${completedValidation.managerName || 'manager'}` : 'Self-Fill (not yet validated)',
      answers,
    })
  }
  for (const m of managerSurveys) {
    for (const t of m.teamMembers) {
      if ((t.status !== 'accepted' && t.status !== 'added') || !t.submittedAt) continue
      const answers = parseAnswers(t.answers)
      if (!answers) continue
      plans.push({ staffId: t.staffId, staffName: t.staffName, businessUnit: t.businessUnit || 'Unassigned', department: null, source: `Manager Team-Fill (${m.managerName})`, answers })
    }
  }

  // questionId -> label (for questions worth counting: select/multiselect only — text/textarea
  // are free-form and not meaningfully countable, rating/yesno are low-cardinality enough to just
  // skip here too, keeping this focused on "what did people pick").
  interface CountableQuestion { id: string; label: string; sectionTitle: string; isRepeating: boolean }
  const countable: CountableQuestion[] = []
  for (const section of sections) {
    if (section.key === 'manager_validation' || section.key === 'confirmation') continue
    for (const q of section.questions) {
      if (q.type === 'select' || q.type === 'multiselect') countable.push({ id: q.id, label: q.label, sectionTitle: section.title, isRepeating: section.key === 'development_needs' })
    }
  }

  type CountMap = Record<string, number>
  interface QuestionBreakdown { questionId: string; label: string; sectionTitle: string; total: CountMap; byBusinessUnit: Record<string, CountMap>; byDepartment: Record<string, CountMap> }
  const breakdowns = new Map<string, QuestionBreakdown>()
  for (const q of countable) breakdowns.set(q.id, { questionId: q.id, label: q.label, sectionTitle: q.sectionTitle, total: {}, byBusinessUnit: {}, byDepartment: {} })

  const bump = (map: CountMap, key: string) => { map[key] = (map[key] || 0) + 1 }
  const addValue = (bd: QuestionBreakdown, bu: string, dept: string | null, v: string | string[] | undefined) => {
    if (v == null) return
    const values = Array.isArray(v) ? v : [v]
    for (const val of values) {
      if (!val) continue
      bump(bd.total, val)
      if (!bd.byBusinessUnit[bu]) bd.byBusinessUnit[bu] = {}
      bump(bd.byBusinessUnit[bu], val)
      const deptKey = dept || 'Unassigned'
      if (!bd.byDepartment[deptKey]) bd.byDepartment[deptKey] = {}
      bump(bd.byDepartment[deptKey], val)
    }
  }

  for (const plan of plans) {
    for (const q of countable) {
      const bd = breakdowns.get(q.id)!
      if (q.isRepeating) {
        for (const need of plan.answers.developmentNeeds) addValue(bd, plan.businessUnit, plan.department, need[q.id])
      } else {
        addValue(bd, plan.businessUnit, plan.department, plan.answers.answers[q.id])
      }
    }
  }

  const businessUnits = [...new Set(plans.map((p) => p.businessUnit))].sort()
  const departments = [...new Set(plans.map((p) => p.department).filter((d): d is string => !!d))].sort()

  // One merged "what capabilities does the organisation need" ranking — the capabilities section
  // normally holds a Primary and a Secondary capability question, counted together here (a person
  // picking the same capability for both only counts once) rather than as two separate rankings a
  // reader has to mentally combine themselves.
  const capabilitiesSection = sections.find((s) => s.key === 'capabilities')
  const capabilityDemand: QuestionBreakdown = { questionId: 'capabilityDemand', label: 'Capability Demand (Primary + Secondary combined)', sectionTitle: capabilitiesSection?.title || 'Capabilities', total: {}, byBusinessUnit: {}, byDepartment: {} }
  if (capabilitiesSection) {
    for (const plan of plans) {
      const picked = new Set<string>()
      for (const q of capabilitiesSection.questions) {
        const v = plan.answers.answers[q.id]
        if (typeof v === 'string' && v) picked.add(v)
      }
      for (const val of picked) {
        bump(capabilityDemand.total, val)
        if (!capabilityDemand.byBusinessUnit[plan.businessUnit]) capabilityDemand.byBusinessUnit[plan.businessUnit] = {}
        bump(capabilityDemand.byBusinessUnit[plan.businessUnit], val)
        const deptKey = plan.department || 'Unassigned'
        if (!capabilityDemand.byDepartment[deptKey]) capabilityDemand.byDepartment[deptKey] = {}
        bump(capabilityDemand.byDepartment[deptKey], val)
      }
    }
  }

  // Group-training candidates — same development need area, same Business Unit, picked by 2+
  // people. A direct "here's where to combine training instead of running it one-on-one" signal
  // for L&D, using the first select question in development_needs (the "what area" question,
  // whatever it's currently labeled) as the grouping key.
  const needsSection = sections.find((s) => s.key === 'development_needs')
  const areaQuestion = needsSection?.questions.find((q) => q.type === 'select')
  const groupOpportunities: { area: string; businessUnit: string; count: number; people: string[] }[] = []
  if (areaQuestion) {
    const groups = new Map<string, { area: string; businessUnit: string; people: string[] }>()
    for (const plan of plans) {
      for (const need of plan.answers.developmentNeeds) {
        const area = need[areaQuestion.id]
        if (typeof area !== 'string' || !area) continue
        const key = `${area}::${plan.businessUnit}`
        const g = groups.get(key) ?? { area, businessUnit: plan.businessUnit, people: [] }
        if (!g.people.includes(plan.staffName)) g.people.push(plan.staffName)
        groups.set(key, g)
      }
    }
    for (const g of groups.values()) if (g.people.length >= 2) groupOpportunities.push({ ...g, count: g.people.length })
    groupOpportunities.sort((a, b) => b.count - a.count)
  }

  return NextResponse.json({
    totalPlans: plans.length,
    businessUnits,
    departments,
    capabilityDemand,
    groupOpportunities,
    questions: [...breakdowns.values()],
    // Full section/question structure (including text/textarea/rating/yesno, not just the
    // countable select/multiselect ones above) — lets the client render a complete per-person
    // drill-down, not just the aggregate counts.
    sections,
    people: plans.map((p) => ({
      staffId: p.staffId, staffName: p.staffName, businessUnit: p.businessUnit, department: p.department, source: p.source, answers: p.answers,
    })),
  })
}
