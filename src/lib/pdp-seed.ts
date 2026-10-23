import { prisma } from './prisma'

interface SeedQuestion {
  label: string
  description?: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'yesno' | 'ranking'
  options?: string[]
  optionsSource?: 'capabilities'
  required?: boolean
  searchable?: boolean
  maxSelect?: number
  // Cross-question conditional visibility within the same section — a local, section-scoped
  // handle (not a real id, since ids don't exist until seedDefaultPDPSections inserts the question)
  // used to wire e.g. "which would help you most…" to only show once "Do you require training in
  // X?" is answered Yes. Resolved to a real PDPQuestion.id at seed/retrofit time.
  localKey?: string
  showIfLocalKey?: string
  showIfEquals?: string
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
const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Occasionally', 'Rarely or never']
const OVERALL_RATING_OPTIONS = ['Beginner', 'Basic', 'Intermediate', 'Advanced', 'Expert']

// Rebuilds one tool's block of the Digital Skill Assessment as its own PDPSection — mirrors the
// 2026 "Digital Skills Self-Assessment" Custom Survey, extended per L&D's follow-up request:
// - the overall skill-level rating (MS Office apps only) moves to question 2, right after
//   frequency, instead of sitting at the end;
// - "which would help you most" is no longer always shown — a "Do you require training in X?"
//   yes/no question gates it, so a respondent who says No never sees an irrelevant checklist.
function toolSection(opts: {
  key: string
  title: string
  freqLabel: string
  canDoLabel: string
  canDoOptions: string[]
  wouldHelpLabel: string
  wouldHelpOptions?: string[] // defaults to canDoOptions, same as the source survey
  extraQuestions?: SeedQuestion[] // inserted right after frequency/overall rating (e.g. AI tools used)
  overallRating?: boolean
  closingLabel?: string // defaults to "Anything else about your use of <title> worth mentioning?"
}): SeedSection {
  const requireTrainingKey = `${opts.key}_require_training`
  return {
    key: opts.key,
    title: opts.title,
    questions: [
      { label: opts.freqLabel, type: 'select', required: true, options: FREQUENCY_OPTIONS },
      ...(opts.overallRating ? [{ label: `Overall, how would you rate your current skill level in ${opts.title}?`, type: 'select' as const, required: true, options: OVERALL_RATING_OPTIONS }] : []),
      ...(opts.extraQuestions ?? []),
      { label: opts.canDoLabel, description: 'Tick all that apply.', type: 'multiselect', searchable: false, options: opts.canDoOptions },
      { label: `Do you require training in ${opts.title}?`, type: 'yesno', required: true, localKey: requireTrainingKey },
      {
        label: opts.wouldHelpLabel,
        description: 'Tick all that apply.',
        type: 'multiselect',
        searchable: false,
        options: opts.wouldHelpOptions ?? opts.canDoOptions,
        showIfLocalKey: requireTrainingKey,
        showIfEquals: 'Yes',
      },
      { label: opts.closingLabel ?? `Anything else about your use of ${opts.title} worth mentioning?`, type: 'textarea', required: false },
    ],
  }
}

// The 10 tool section titles, in the order they're offered on the gating question and in the
// Training Priority wrap-up — kept here as the one list both reference, so adding/removing a tool
// only ever means editing this array plus its toolSection() entry below.
export const DIGITAL_SKILL_TOOL_TITLES = [
  'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Outlook', 'Microsoft Teams',
  'Power BI', 'SQL', 'Power Automate / no-code workflow automation',
  'AI Literacy, Prompt Engineering & Responsible AI', 'Virtual Advisory & Digital Prospecting',
]

export const PDP_DEFAULT_SECTIONS: SeedSection[] = [
  // Gates everything that follows — a respondent only sees the per-tool sections for what they
  // pick here (see computeSelectedTools/isToolSectionVisible in pdp-wrapup.ts), so someone who
  // never touches SQL never has to scroll past SQL questions.
  {
    key: 'digital_skill_tool_selection',
    title: 'Which of these do you use, or expect to use, in your role?',
    description: 'Tick everything that applies — you\'ll only be asked about the tools you select here. "AI" covers tools like ChatGPT/Copilot/Claude; "Virtual Advisory" covers remote client advisory and digital prospecting (web, SMS, email, etc.).',
    questions: [
      {
        label: 'Tools you use or expect to use',
        type: 'multiselect',
        required: true,
        searchable: false,
        options: DIGITAL_SKILL_TOOL_TITLES,
      },
    ],
  },
  // Section A — completed by whoever is filling the form (the employee self-rating on Track A, or
  // the line manager rating on their behalf on Track B). Mirrors the 2026 "Digital Skills
  // Self-Assessment" Custom Survey question-for-question (checklist wording transcribed verbatim
  // from CustomSurveyQuestion via extract-digital-skills-survey.sql), so L&D sees the same
  // instrument across both surveys.
  toolSection({
    key: 'digital_skill_word',
    title: 'Microsoft Word',
    freqLabel: 'How often do you use Microsoft Word in your day-to-day work?',
    canDoLabel: 'Which of these can you already do in Word?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Format documents using styles (not manual formatting)',
      'Apply headers/footers, page numbers, and page breaks',
      'Use track changes and comments for collaborative review',
      'Insert and format tables, images, and headings consistently',
      'Create a table of contents from heading styles',
      'Use mail merge for bulk letters/labels',
      'Use Find & Replace with formatting options, not just plain text',
      'Convert a document to PDF while preserving layout',
      'Use built-in templates for common documents (memos, letters)',
      'Protect a document (restrict editing, password-protect)',
    ],
    overallRating: true,
  }),
  toolSection({
    key: 'digital_skill_excel',
    title: 'Microsoft Excel',
    freqLabel: 'How often do you use Microsoft Excel in your day-to-day work?',
    canDoLabel: 'Which of these can you already do in Excel?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Enter and format data (number formats, conditional formatting)',
      'Build and audit basic formulas (SUM, AVERAGE, IF)',
      'Sort and filter data reliably',
      'Use lookup functions (VLOOKUP/XLOOKUP/INDEX-MATCH)',
      'Build PivotTables to summarise data',
      'Create and format charts appropriate to the data',
      'Apply data validation and protect key cells/sheets',
      'Use basic macros/VBA to automate repetitive tasks',
      'Use Flash Fill / Text to Columns to clean up messy data quickly',
      'Freeze panes and split windows to navigate large sheets',
    ],
    overallRating: true,
  }),
  toolSection({
    key: 'digital_skill_powerpoint',
    title: 'Microsoft PowerPoint',
    freqLabel: 'How often do you use Microsoft PowerPoint in your day-to-day work?',
    canDoLabel: 'Which of these can you already do in PowerPoint?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Build a deck using the master/template rather than ad-hoc formatting',
      'Structure a clear narrative across a deck (not just bullet dumps)',
      'Use speaker notes effectively for delivery',
      'Insert and format charts/images/tables cleanly',
      'Apply simple, purposeful animations/transitions',
      'Present confidently using the deck as a visual aid',
      'Link live Excel data into a deck (linked charts/tables that update)',
      'Apply a master template to keep a consistent theme throughout a deck',
      'Reuse content from another presentation without breaking formatting',
      'Export/share a deck as a PDF or video',
    ],
    overallRating: true,
  }),
  toolSection({
    key: 'digital_skill_outlook',
    title: 'Microsoft Outlook',
    freqLabel: 'How often do you use Microsoft Outlook in your day-to-day work?',
    canDoLabel: 'Which of these can you already do in Outlook?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Manage inbox with folders/rules rather than a flooded inbox',
      'Schedule meetings with correct attendees, rooms, and reminders',
      'Use calendar sharing/delegation appropriately',
      'Flag, categorise, and follow up on action items',
      'Use out-of-office and forwarding settings correctly',
      'Use Quick Steps or templates to speed up repetitive emails',
      'Use shared mailboxes/calendars correctly',
      'Search effectively across a large mailbox',
    ],
    overallRating: true,
  }),
  toolSection({
    key: 'digital_skill_teams',
    title: 'Microsoft Teams',
    freqLabel: 'How often do you use Microsoft Teams in your day-to-day work?',
    canDoLabel: 'Which of these can you already do in Teams?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Join/host meetings, share screen, and use chat during a call',
      'Organise files and conversations using channels and tabs',
      'Co-author a document live with others inside Teams',
      'Use @mentions and threaded replies so conversations stay organised',
      'Record meetings and use/review auto-generated transcripts',
      'Set up and manage a Team (channels, permissions, guest access) for a project',
      'Pin important channels/messages for quick access',
      'Use Teams on mobile to stay responsive while away from your desk',
    ],
    overallRating: true,
  }),
  toolSection({
    key: 'digital_skill_powerbi',
    title: 'Power BI',
    freqLabel: 'How often do you use Power BI in your day-to-day work?',
    canDoLabel: 'Which of these can you already do in Power BI?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Connect to a data source and load data into Power BI',
      'Build basic visuals (bar/line/table) from existing data',
      'Use filters and slicers to make a report explorable',
      'Create simple calculated columns/measures (basic DAX)',
      'Build and publish a full report/dashboard to a workspace',
      'Use Power Query to clean/transform data before it hits the report',
      'Write more advanced DAX (time intelligence, relationships across tables)',
      'Apply row-level security to control who sees what',
      'Schedule automatic data refreshes',
      'Use bookmarks to build a guided report narrative',
    ],
  }),
  toolSection({
    key: 'digital_skill_sql',
    title: 'SQL',
    freqLabel: 'How often do you write or read SQL (Structured Query Language) in your day-to-day work?',
    canDoLabel: 'Which of these can you already do in SQL?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Write a basic SELECT query to pull specific columns/rows',
      'Filter data using WHERE with multiple conditions',
      'Sort and aggregate data (ORDER BY, GROUP BY, COUNT/SUM/AVG)',
      'Join two or more tables together (INNER/LEFT JOIN)',
      'Write subqueries or use CTEs for more complex questions',
      'Write/modify data (INSERT, UPDATE, DELETE) safely',
      'Optimise a slow query or read a basic execution plan',
      'Use window functions (RANK, ROW_NUMBER, running totals)',
      'Handle NULLs and data-type conversions correctly',
      'Design or modify a table structure',
    ],
  }),
  toolSection({
    key: 'digital_skill_power_automate',
    title: 'Power Automate / no-code workflow automation',
    freqLabel: 'How often do you use Power Automate or similar no-code workflow tools in your day-to-day work?',
    canDoLabel: 'Which of these can you already do?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Understand what a "flow" is and where to find existing ones that affect your work',
      'Set up a simple trigger-based flow (e.g. notify me when an email/file arrives)',
      'Automate a repetitive multi-step task (e.g. approval routing, data entry between apps)',
      'Connect two or more different apps/systems in one flow',
      'Use conditions/branching logic within a flow',
      'Troubleshoot a flow that is failing or behaving unexpectedly',
      'Build and maintain a flow used by a whole team, not just yourself',
      'Use an approval flow with multiple approvers',
      'Handle errors and retries within a flow',
      'Hand over ownership of a flow to a colleague',
    ],
    closingLabel: 'Anything else worth mentioning?',
  }),
  toolSection({
    key: 'digital_skill_ai',
    title: 'AI Literacy, Prompt Engineering & Responsible AI',
    freqLabel: 'How often do you use AI tools (e.g. ChatGPT, Microsoft Copilot) in your day-to-day work?',
    canDoLabel: 'Which of these can you already do?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    extraQuestions: [
      {
        label: 'Which AI tools do you currently use for work?',
        description: 'Tick all that apply.',
        type: 'multiselect',
        searchable: false,
        options: ['ChatGPT', 'Microsoft Copilot', 'Google Gemini', 'Claude', 'Another AI writing/image tool', 'None yet'],
      },
    ],
    canDoOptions: [
      'Use an AI tool for everyday tasks like drafting emails or summarising text',
      'Write clear, specific prompts to get a useful result on the first or second try',
      'Fact-check and review AI-generated output before using it in real work',
      'Know what company/client data is NOT safe to put into an AI tool',
      'Use multi-step prompting (breaking a task down, giving examples) to get better results',
      'Know which AI tools are officially approved for work use',
      'Spot when AI output might be biased, outdated, or confidently wrong',
      'Use AI to analyse or summarise a spreadsheet/dataset',
      'Adjust AI output style/tone for different audiences',
      'Understand the limits of using AI in regulated/compliance-sensitive work',
    ],
    closingLabel: 'Anything else about your use of AI tools worth mentioning?',
  }),
  toolSection({
    key: 'digital_skill_virtual_advisory',
    title: 'Virtual Advisory & Digital Prospecting',
    freqLabel: 'How often does virtual client advisory or digital prospecting form part of your day-to-day work?',
    canDoLabel: 'Which of these can you already do?',
    wouldHelpLabel: 'Which of these would help you most in your role if you could do them?',
    canDoOptions: [
      'Conduct a client meeting/consultation over video call professionally (audio/video/screen-share working smoothly)',
      'Share and walk a client through portfolios, proposals, or documents on screen during a virtual meeting',
      'Use the CRM to log, track, and follow up on client/prospect interactions',
      'Identify and reach new prospects through digital channels (LinkedIn, email, social media)',
      'Build a personal digital presence (e.g. LinkedIn profile/content) that attracts client interest',
      'Onboard a new client fully digitally (e-signature, online KYC/forms) without an in-person meeting',
      'Use client data/engagement patterns to identify cross-sell or upsell opportunities',
      'Build trust and rapport with a client remotely, without in-person cues',
      'Stay compliant (data protection, advice suitability, record-keeping) when advising or prospecting digitally',
      'Use digital signature/e-KYC tools confidently',
    ],
    closingLabel: 'Anything else worth mentioning?',
  }),
  // Not required — the list of tools shown here is filtered at render time down to whatever the
  // respondent still needs training on (see resolveWrapupSectionQuestions in pdp-wrapup.ts): a
  // tool they said they rarely/never use, or already rated themselves Advanced/Expert in, is left
  // out entirely. `options` here is the full fallback list before that filtering runs.
  {
    key: 'digital_skill_wrapup',
    title: 'Training Priority',
    description: "Put these in the order you'd like to be trained on them (most important first — use the arrows to reorder). Anything you're already comfortable with, or rarely/never use, won't be shown here.",
    questions: [
      {
        label: 'Your training priority order',
        type: 'ranking',
        required: false,
        options: [
          'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Outlook', 'Microsoft Teams',
          'Power BI', 'SQL', 'Power Automate / no-code workflow automation',
          'AI Literacy, Prompt Engineering & Responsible AI', 'Virtual Advisory & Digital Prospecting',
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
    // Inserted one at a time (not createMany) so a question with `showIfLocalKey` can resolve it
    // against the real id of the question created moments earlier in this same loop — createMany
    // doesn't hand back per-row ids in a usable order for that.
    const localKeyToId: Record<string, string> = {}
    for (const [i, q] of section.questions.entries()) {
      const createdQuestion = await prisma.pDPQuestion.create({
        data: {
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
          showIfQuestionId: q.showIfLocalKey ? (localKeyToId[q.showIfLocalKey] ?? null) : null,
          showIfEquals: q.showIfEquals ?? null,
        },
      })
      if (q.localKey) localKeyToId[q.localKey] = createdQuestion.id
    }
  }
}
