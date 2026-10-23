import { prisma } from './prisma'

interface SeedQuestion {
  label: string
  description?: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'yesno'
  options?: string[]
  optionsSource?: 'capabilities'
  required?: boolean
  searchable?: boolean
  maxSelect?: number
}

interface SeedSection {
  key: string
  title: string
  description?: string
  maxRepeats?: number
  questions: SeedQuestion[]
}

// Meristem's standard 2027 PDP structure — seeded onto every new cycle as a starting point, fully
// editable afterward (title/description/options/required/order, add or remove questions) via the
// admin panel. Mirrors the structure agreed with L&D: Section 1 (Employee Information) isn't here
// — it's system-rendered from the roster + 2026 training history, not an editable question bank.
// Section 8 (L&D Use Only) isn't here either — see PDPReview, filled later in the admin panel,
// never shown to a respondent.
const SKILL_RATING_OPTIONS = ['Proficient', 'Needs Practice', 'Not Yet Able', 'N/A']
// One 'select' question per skill item, with the app name folded into the label itself since the
// section/question model has no native sub-heading — kept in the same order as the source
// checklist (Word, Excel, PowerPoint, Outlook) so the app groupings still read clearly.
function skillQuestion(label: string): SeedQuestion {
  return { label, type: 'select', options: SKILL_RATING_OPTIONS, required: true, searchable: true }
}

export const PDP_DEFAULT_SECTIONS: SeedSection[] = [
  // Section A — completed by whoever is filling the form (the employee self-rating on Track A, or
  // the line manager rating on their behalf on Track B), same as every other respondent section;
  // not specific to one track. Transcribed from "Line Manager's MS Office Skills Assessment
  // Checklist" (MS_Office_Skills_Assessment_Checklist.docx) rather than re-written, so the wording
  // matches what L&D already uses elsewhere.
  {
    key: 'digital_skill_assessment',
    title: 'Digital Skill Assessment',
    description: 'Rate each skill: Proficient / Needs Practice / Not Yet Able / N/A (not required for your role). Focus on skills relevant to your role — it’s fine to mark items N/A.',
    questions: [
      skillQuestion('Microsoft Word — Formats documents using styles (not manual formatting)'),
      skillQuestion('Microsoft Word — Applies headers/footers, page numbers, and page breaks correctly'),
      skillQuestion('Microsoft Word — Uses track changes and comments for collaborative review'),
      skillQuestion('Microsoft Word — Inserts and formats tables, images, and headings consistently'),
      skillQuestion('Microsoft Word — Creates a table of contents from heading styles'),
      skillQuestion('Microsoft Word — Uses mail merge for bulk letters/labels'),
      skillQuestion('Microsoft Excel — Builds and audits basic formulas (SUM, AVERAGE, IF)'),
      skillQuestion('Microsoft Excel — Applies consistent formatting (number formats, conditional formatting)'),
      skillQuestion('Microsoft Excel — Sorts and filters data reliably'),
      skillQuestion('Microsoft Excel — Uses lookup functions (VLOOKUP/XLOOKUP/INDEX-MATCH)'),
      skillQuestion('Microsoft Excel — Builds PivotTables to summarise data'),
      skillQuestion('Microsoft Excel — Creates and formats charts appropriate to the data'),
      skillQuestion('Microsoft Excel — Applies data validation and protects key cells/sheets'),
      skillQuestion('Microsoft PowerPoint — Builds slides using the master/template rather than ad-hoc formatting'),
      skillQuestion('Microsoft PowerPoint — Structures a clear narrative across a deck (not just bullet dumps)'),
      skillQuestion('Microsoft PowerPoint — Uses speaker notes effectively for delivery'),
      skillQuestion('Microsoft PowerPoint — Inserts and formats charts/images/tables cleanly'),
      skillQuestion('Microsoft PowerPoint — Applies simple, purposeful animation/transitions (not excessive)'),
      skillQuestion('Microsoft PowerPoint — Presents confidently using the deck as a visual aid'),
      skillQuestion('Microsoft Outlook — Manages inbox with folders/rules rather than a single flooded inbox'),
      skillQuestion('Microsoft Outlook — Schedules meetings with correct attendees, rooms, and reminders'),
      skillQuestion('Microsoft Outlook — Uses calendar sharing/delegation appropriately'),
      skillQuestion('Microsoft Outlook — Flags, categorises, and follows up on action items'),
      skillQuestion('Microsoft Outlook — Uses out-of-office and forwarding settings correctly'),
      { label: 'Priority areas identified', description: 'Based on the ratings above, which skills most need development?', type: 'textarea', required: true },
      {
        label: 'Recommended action',
        type: 'select',
        required: true,
        searchable: true,
        options: [
          'Self-paced module',
          'Live workshop / group training session',
          'Peer coaching / super-user pairing',
          'One-on-one refresher with L&D',
          'No action needed — proficient across relevant areas',
        ],
      },
    ],
  },
  {
    key: 'role_alignment',
    title: 'Role and Business Alignment',
    description: 'Complete based on your current role, performance expectations and development needs for 2027.',
    questions: [
      {
        label: 'Primary Role Responsibilities',
        description: 'Select up to three responsibilities that are most critical to your role.',
        type: 'multiselect',
        maxSelect: 3,
        searchable: true,
        required: true,
        options: [
          'Client acquisition and relationship management',
          'Sales, revenue generation and business development',
          'Investment, research and financial analysis',
          'Transaction processing and service delivery',
          'Risk management, compliance and controls',
          'Operations and process improvement',
          'Technology, systems and digital solutions',
          'Data analysis, reporting and insights',
          'Strategy, planning and execution',
          'People management and team development',
          'Project and programme management',
          'Corporate support and administration',
          'Other',
        ],
      },
      {
        label: 'Primary Development Driver',
        description: 'What is the main reason for your proposed development?',
        type: 'select',
        required: true,
        searchable: true,
        options: [
          'Improve performance in my current role',
          'Close an identified skills or knowledge gap',
          "Support my team's 2027 objectives",
          'Support a new responsibility or expanded role',
          'Adapt to a new system, technology or process',
          'Meet a regulatory or compliance requirement',
          'Improve productivity, quality or turnaround time',
          'Prepare for future business or role requirements',
        ],
      },
      {
        label: 'Relevant Business Outcome',
        description: 'Which outcome would your development primarily support?',
        type: 'select',
        required: true,
        searchable: true,
        options: [
          'Revenue growth and business development',
          'Customer experience and client satisfaction',
          'Operational efficiency and productivity',
          'Quality, accuracy and turnaround time',
          'Risk management and regulatory compliance',
          'Digital adoption, automation and innovation',
          'Strategic execution and business performance',
          'Employee capability and team effectiveness',
          'Other',
        ],
      },
    ],
  },
  {
    key: 'capabilities',
    title: "Alignment with Meristem's Strategic Capabilities",
    description: 'Select the strategic capability most relevant to your development needs, from the official list.',
    questions: [
      { label: 'Primary capability', type: 'select', optionsSource: 'capabilities', searchable: true, required: true },
      { label: 'Secondary capability (if applicable)', type: 'select', optionsSource: 'capabilities', searchable: true, required: false },
    ],
  },
  {
    key: 'development_needs',
    title: 'Skills Gap and Development Needs',
    description: 'Complete one entry for each priority development need — add up to three.',
    maxRepeats: 3,
    questions: [
      {
        label: 'Skill or capability area',
        type: 'select',
        required: true,
        searchable: true,
        options: [
          'Technical/job-specific skills',
          'Financial, investment or analytical skills',
          'Sales and business development',
          'Client service and relationship management',
          'Risk, compliance and regulatory knowledge',
          'Digital tools and workplace applications',
          'Data analytics and reporting',
          'AI, automation and emerging technology',
          'Communication and presentation',
          'Problem-solving and critical thinking',
          'Project management and execution',
          'People management and collaboration',
          'Strategic thinking and commercial awareness',
          'Other',
        ],
      },
      {
        label: 'Nature of the development need',
        type: 'select',
        required: true,
        searchable: true,
        options: [
          'New skill required',
          'Existing skill needs improvement',
          'Knowledge of a new system, process or regulation',
          'Skill required for expanded responsibilities',
          'Skill required for future business needs',
        ],
      },
      {
        label: 'Evidence supporting the need',
        type: 'select',
        required: true,
        searchable: true,
        options: [
          'Performance appraisal feedback',
          'Skills assessment or competency test',
          'Manager feedback',
          'Work quality or error trends',
          'Productivity or turnaround-time issues',
          'Customer or stakeholder feedback',
          'New role, system, process or regulation',
          'Team or business performance requirement',
          'Other',
        ],
      },
      {
        label: 'Priority',
        type: 'select',
        required: true,
        searchable: true,
        options: [
          'High: Critical to role performance or business delivery',
          'Medium: Important for improved performance',
          'Low: Longer-term development need',
        ],
      },
      { label: 'Brief description of the specific gap', type: 'textarea', required: true },
      {
        label: 'Expected improvement after the learning intervention',
        description: 'Select up to three.',
        type: 'multiselect',
        maxSelect: 3,
        searchable: true,
        required: true,
        options: [
          'Improved technical competence',
          'Faster turnaround time',
          'Fewer errors and improved accuracy',
          'Improved productivity or output',
          'Increased revenue or business contribution',
          'Improved customer experience',
          'Stronger compliance and risk management',
          'Improved use of digital tools or systems',
          'Better analysis and decision-making',
          'Improved collaboration or team effectiveness',
          'Improved project execution',
          'Readiness for new responsibilities',
          'Other',
        ],
      },
      {
        label: 'How will the improvement be demonstrated?',
        description: 'Select up to three.',
        type: 'multiselect',
        maxSelect: 3,
        searchable: true,
        required: true,
        options: [
          'Practical assessment or simulation',
          'Demonstration of a task on the job',
          'Review of work output or quality',
          'Productivity or turnaround-time metrics',
          'Sales, revenue or client service metrics',
          'Compliance or error-rate metrics',
          'Manager observation and feedback',
          'Completion of a workplace project or assignment',
          'Other',
        ],
      },
      {
        label: 'Expected measure of success',
        description: 'Select every way this will be measured.',
        type: 'multiselect',
        searchable: true,
        required: true,
        options: [
          'Percentage increase',
          'Number/volume increase',
          'Time or turnaround reduction',
          'Error or defect reduction',
          'Quality or accuracy score improvement',
          'Certification or qualification obtained',
          'Observed behaviour or competence change',
          'Revenue or sales increase',
          'Customer or client satisfaction score improvement',
          'Completion of an assigned project or task',
          'Other',
        ],
      },
    ],
  },
  {
    key: 'confirmation',
    title: 'Confirmation',
    questions: [
      { label: 'I confirm that the information provided reflects my development needs.', type: 'yesno', required: true },
    ],
  },
  {
    key: 'manager_validation',
    title: 'Line Manager Validation',
    description: "To be completed by the line manager. Confirms the relevance of the development need — it does not constitute final approval of training expenditure.",
    questions: [
      {
        label: "Do the identified development needs accurately reflect the employee's role, available evidence, and team/business priorities?",
        type: 'select',
        required: true,
        searchable: true,
        options: ['Yes', 'Partly', 'No'],
      },
      {
        label: 'Is the proposed development approach appropriate, with a clear expected workplace improvement?',
        type: 'select',
        required: true,
        searchable: true,
        options: ['Yes', 'Partly', 'No', 'Alternative recommended'],
      },
      { label: "Manager's Comments", type: 'textarea', required: false },
      {
        label: "Manager's Overall Recommendation",
        type: 'select',
        required: true,
        searchable: true,
        options: ['Approved for submission to L&D', 'Approved with amendments', 'Further discussion required'],
      },
      { label: "I have reviewed the employee's PDP against role and business requirements.", type: 'yesno', required: true },
    ],
  },
  // Only ever rendered on the Track A validate page, one block per Development Need (same
  // maxRepeats as 'development_needs' so they line up 1:1) — kept as its own section rather than
  // folded into 'manager_validation' so each judgement sits next to the specific need it's about
  // instead of in one flat block at the end. The baseline rating exists specifically so Post-
  // Training impact checks later in 2027 have something to benchmark against — captured here,
  // before the training happens, not asked for the first time afterward.
  {
    key: 'manager_need_review',
    title: 'Per-Need Manager Assessment',
    description: 'Completed by the line manager for each Development Need above.',
    maxRepeats: 3,
    questions: [
      {
        label: "Manager's Priority Assessment",
        type: 'select',
        required: true,
        searchable: true,
        options: ['High priority for 2027', 'Medium priority for 2027', 'Low priority for 2027', 'Defer to a future period', 'Not recommended'],
      },
      {
        label: "Employee's Current Proficiency (baseline, before training)",
        description: '1 = No proficiency, 5 = Expert. Used as the baseline to benchmark against after the training is delivered.',
        type: 'rating',
        required: true,
      },
    ],
  },
]

export async function seedDefaultPDPSections(cycleId: string): Promise<void> {
  for (const [sectionOrder, section] of PDP_DEFAULT_SECTIONS.entries()) {
    const created = await prisma.pDPSection.create({
      data: {
        cycleId,
        order: sectionOrder,
        key: section.key,
        title: section.title,
        description: section.description || null,
        maxRepeats: section.maxRepeats ?? 1,
      },
    })
    await prisma.pDPQuestion.createMany({
      data: section.questions.map((q, i) => ({
        cycleId,
        sectionId: created.id,
        order: i,
        label: q.label,
        description: q.description || null,
        type: q.type,
        options: q.options && q.options.length > 0 ? JSON.stringify(q.options) : null,
        optionsSource: q.optionsSource || null,
        required: q.required ?? false,
        searchable: q.searchable ?? false,
        maxSelect: q.maxSelect ?? null,
      })),
    })
  }
}
