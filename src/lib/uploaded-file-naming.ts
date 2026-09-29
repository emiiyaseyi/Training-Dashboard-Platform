// Shared "Staff Name - Training Name - Training Date - original file name" naming convention for
// everything in UploadedFile, applied both at upload time (see the two upload routes) and by the
// one-time backfill (POST /api/admin/survey-files/backfill-names) for files uploaded before this
// existed — so the file itself is identifiable without having to cross-reference the admin table
// it's listed in (e.g. once downloaded, or shared onward).

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Strips characters that are invalid (or awkward) in a filename on Windows/macOS — every other
// character, including spaces, is left alone.
function sanitizeForFileName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '-').trim()
}

export function buildUploadedFileName(staffName: string, trainingName: string, trainingDate: Date | null, originalFileName: string): string {
  const parts = [staffName, trainingName, trainingDate ? formatDate(trainingDate) : null].filter(Boolean) as string[]
  return `${sanitizeForFileName(parts.join(' - '))} - ${originalFileName}`
}

// Whether a stored fileName already looks like it went through buildUploadedFileName — used by
// the backfill so it's safe to re-run (already-renamed rows are left untouched) and so the
// panel's "Rename Existing Files" button can report how many still need it.
export function looksAlreadyRenamed(fileName: string, staffName: string, trainingName: string): boolean {
  const prefix = sanitizeForFileName(`${staffName} - ${trainingName}`)
  return fileName.startsWith(prefix)
}
