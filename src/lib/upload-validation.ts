const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv']
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25MB — generous for a staff/training spreadsheet, small enough to reject an obviously wrong file

// Rejects anything that isn't a spreadsheet before it reaches XLSX.read() — without this, an
// unrecognised file (a PDF, an image, a renamed .exe) throws deep inside the parser and surfaces
// as a generic 500, instead of a clear "please upload an Excel/CSV file" message.
export function validateUploadFile(file: File): string | null {
  const name = file.name.toLowerCase()
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
  if (!hasAllowedExtension) {
    return `"${file.name}" isn't a supported file type — please upload an Excel (.xlsx/.xls) or CSV file.`
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB) — the limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`
  }
  return null
}
