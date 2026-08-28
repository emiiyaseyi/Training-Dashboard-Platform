// Allow-list for "file"-type survey question attachments (e.g. "Certification Issued") — separate
// from upload-validation.ts, which validates the bulk Excel/CSV data uploads (staff roster,
// training data, etc.), a completely different upload path with its own allowed types.
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.ppt', '.pptx', '.docx', '.xlsx']

export const ALLOWED_SURVEY_FILE_TYPES_LABEL = 'PDF, PNG, JPEG, PowerPoint, Word (.docx), or Excel (.xlsx)'

// Extension-based, same approach as upload-validation.ts — browser-reported MIME types for Office
// formats are inconsistent enough across OS/browser combinations to not be trustworthy alone.
export function isAllowedSurveyFileType(fileName: string): boolean {
  const name = fileName.toLowerCase()
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
}
