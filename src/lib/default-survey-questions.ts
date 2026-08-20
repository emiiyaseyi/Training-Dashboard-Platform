// Default question sets, seeded once per stage on first request (same self-seeding pattern as
// TrainingType/DifferentiatingCapability). Admin can edit/reorder/add/remove after that via the
// (upcoming) question editor — this is just the starting point, taken from the agreed documents.

export interface DefaultQuestion {
  section?: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'date' | 'yesno' | 'file'
  options?: string[]
  required: boolean
  autoFill?: 'trainingName' | 'businessUnit' | 'employeeName' | 'role' | 'recipientName'
  fieldKey?: string
  driveFolderId?: string
}

const VENDOR_OPTIONS = [
  'Lagos Business School',
  'PwC Nigeria Academy',
  'Phillips Consulting (PCL)',
  'Financial Institutions Training Centre (FITC)',
  'Nigeria Inter-Bank Settlement System (NIBSS)',
  'Investment Advisers and Portfolio Managers (IAPM)',
  'LIMSimple',
  'Selling Skills Nigeria',
  'RICH Consulting Limited',
  'Other',
]

export const DEFAULT_QUESTIONS: Record<'pre' | 'post1' | 'post2', DefaultQuestion[]> = {
  pre: [
    { section: 'Training Expectations', label: 'Training Title/Name', type: 'text', required: false, autoFill: 'trainingName' },
    { section: 'Training Expectations', label: 'Why were you nominated for this training / What do you hope to learn from this training?', type: 'textarea', required: true },
    { section: 'Training Expectations', label: 'How relevant is this training to your current role?', type: 'rating', required: true },
    { section: 'Training Expectations', label: 'What challenges do you face that this training might help address?', type: 'textarea', required: false },
    { section: 'Training Expectations', label: 'Your preferred learning style', type: 'select', options: ['Visual', 'Auditory', 'Reading/Writing', 'Hands-on/Kinesthetic'], required: false },
    { section: 'Current Skill Level (Self-Assessment)', label: 'Rate your current knowledge/skill in the nominated training topic (1 = Novice, 5 = Expert)', type: 'rating', required: true },
    { section: 'Current Skill Level (Self-Assessment)', label: 'Have you received any prior training on this topic?', type: 'yesno', required: true },
    { section: 'Current Skill Level (Self-Assessment)', label: 'What’s your preferred way to apply this training in your day to day activities?', type: 'textarea', required: false },
  ],
  post1: [
    { section: 'Bio-Data', label: 'Business Unit', type: 'text', required: false, autoFill: 'businessUnit' },
    { section: 'Bio-Data', label: 'Role', type: 'text', required: false, autoFill: 'role' },
    { section: 'Bio-Data', label: 'Training Title', type: 'text', required: false, autoFill: 'trainingName' },
    { section: 'Bio-Data', label: 'Training Type', type: 'select', options: ['External', 'Internal', 'LMS'], required: true },
    { section: 'Bio-Data', label: 'Proposed date to share acquired training knowledge with your team', type: 'date', required: false },

    { section: 'Reaction & Relevance', label: 'How relevant is this training to your current role?', type: 'rating', required: true, fieldKey: 'roleRelevance' },
    { section: 'Reaction & Relevance', label: 'To what extent were your expectations met?', type: 'rating', required: true, fieldKey: 'expectationsMet' },
    { section: 'Reaction & Relevance', label: 'What specific topics or sessions did you find most beneficial?', type: 'textarea', required: false },

    { section: 'Learning & Application', label: 'What new knowledge, skills or insights did you gain from this training?', type: 'textarea', required: false },
    { section: 'Learning & Application', label: 'Have you applied or do you plan to apply what you learned?', type: 'select', options: ['Yes, already applying', 'Yes, within the next month', 'Not yet sure how', 'No plans to apply'], required: true, fieldKey: 'applicationResponse' },
    { section: 'Learning & Application', label: 'Please give specific examples of how you have applied or will apply what you’ve learned in your daily work.', type: 'textarea', required: false },

    { section: 'Business Impact & Performance', label: 'Which of the following areas do you expect the training to positively impact within your team and the business? (select all that apply)', type: 'multiselect', options: ['Productivity', 'Client satisfaction', 'Accuracy or quality of work', 'Communication or collaboration', 'Innovation or problem-solving', 'Decision making', 'Time management', 'Business Development Target'], required: false, fieldKey: 'impactAlignment' },
    { section: 'Business Impact & Performance', label: 'In your view, how will training contribute to your team’s or department’s performance?', type: 'textarea', required: false },
    { section: 'Business Impact & Performance', label: 'How confident are you that this training contributes to overall business goals?', type: 'rating', required: true, fieldKey: 'confidenceRating' },

    { section: 'Final Reflections', label: 'How would you rate the overall effectiveness and professionalism of the training vendor/provider/facilitator in delivering this programme?', type: 'rating', required: true, fieldKey: 'vendorRating' },
    { section: 'Final Reflections', label: 'Training Provider/Facilitator', type: 'select', options: VENDOR_OPTIONS, required: false, fieldKey: 'vendorName' },
    { section: 'Final Reflections', label: 'Would you recommend this training to others in the business?', type: 'select', options: ['Yes', 'No', 'Maybe'], required: false },
    { section: 'Final Reflections', label: 'Any additional comments or recommendations?', type: 'textarea', required: false, fieldKey: 'qualitativeResponse' },

    { section: 'Attachments', label: 'Learning Resources/Materials', type: 'file', required: false, driveFolderId: '1rjUEVvDYI93SQORpwWDo0ke9pjT1JND6' },
    { section: 'Attachments', label: 'Certification Issued', type: 'file', required: false, driveFolderId: '1fvzO4r3ASNV0FKMtPhXkliUqAvTEvduP' },
  ],
  post2: [
    { section: 'General Information', label: 'Name', type: 'text', required: false, autoFill: 'recipientName' },
    { section: 'General Information', label: 'Business Unit', type: 'text', required: false, autoFill: 'businessUnit' },
    { section: 'General Information', label: 'Employee Name being evaluated', type: 'text', required: false, autoFill: 'employeeName' },
    { section: 'General Information', label: 'Training Title', type: 'text', required: false, autoFill: 'trainingName' },

    { section: 'Application of Learning', label: 'Since attending the training, have you noticed any change in the employee’s performance?', type: 'select', options: ['Significant improvement', 'Some improvement', 'No noticeable change', 'Decline in performance'], required: true },
    { section: 'Application of Learning', label: 'To what extent has the employee applied the knowledge or skills from the training in their role?', type: 'select', options: ['Consistently applied', 'Occasionally applied', 'Rarely applied', 'Not applied at all'], required: true },
    { section: 'Application of Learning', label: 'Please give examples of how the employee has applied what was learned in their day-to-day work.', type: 'textarea', required: false },

    { section: 'Overall Assessment', label: 'On a scale of 1–5, how valuable was this training for the employee’s role?', type: 'rating', required: true, fieldKey: 'impactScore' },
    { section: 'Overall Assessment', label: 'On a scale of 1–5, how valuable was this training for your team/department?', type: 'rating', required: false },
    { section: 'Overall Assessment', label: 'Would you recommend similar training for other team members?', type: 'yesno', required: false },
    { section: 'Overall Assessment', label: 'Additional comments or recommendations?', type: 'textarea', required: false, fieldKey: 'comments' },
  ],
}
