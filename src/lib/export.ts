export interface ExportSheet {
  name: string
  rows: Record<string, unknown>[]
}

async function getXLSX() {
  const mod = await import('xlsx')
  return mod.default ?? mod
}

export async function exportExcel(sheets: ExportSheet[], filename: string) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, rows }) => {
    const safeRows = rows.length > 0 ? rows : [{ '(no data)': '' }]
    const ws = XLSX.utils.json_to_sheet(safeRows)
    ws['!cols'] = Object.keys(safeRows[0]).map((k) => ({
      wch: Math.max(k.length + 2, ...safeRows.map((r) => String(r[k] ?? '').length + 2)),
    }))
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  })
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export async function exportCSV(rows: Record<string, unknown>[], filename: string) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ '(no data)': '' }])
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.csv`, { bookType: 'csv' })
}

export function nairaNum(n: number): number {
  return Math.round(n * 100) / 100
}

// Splits a flat rows array (each expected to carry a "businessUnit" field) into "All" plus one
// section per distinct Business Unit, each already mapped through the caller's row-shaping —
// shared by every Download Report panel (Training/KSS/Subscription) that adds a per-Business-Unit
// breakdown: one Excel sheet per BU (plus "All"), or one PDF page-group per BU.
export function buildBusinessUnitSections(
  rawRows: Record<string, unknown>[],
  mapRow: (r: Record<string, unknown>) => Record<string, unknown>,
  allLabel = 'All'
): { name: string; rows: Record<string, unknown>[] }[] {
  const byBU = new Map<string, Record<string, unknown>[]>()
  for (const r of rawRows) {
    const bu = String(r.businessUnit || 'Unassigned')
    if (!byBU.has(bu)) byBU.set(bu, [])
    byBU.get(bu)!.push(mapRow(r))
  }
  const sections = [{ name: allLabel, rows: rawRows.map(mapRow) }]
  ;[...byBU.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([bu, rows]) => sections.push({ name: bu, rows }))
  return sections
}

export interface PdfSection {
  title: string
  rows: Record<string, unknown>[]
}

// Plain-grid table PDF — no autotable dependency (not installed), just jsPDF's own text/line
// primitives. Columns are evenly split across the usable page width and each cell's text is
// clipped to fit (with an ellipsis) rather than wrapped, keeping every row a fixed, predictable
// height so page breaks are simple to compute. Each section (e.g. one per Business Unit) always
// starts on its own fresh page — the PDF equivalent of the Excel export's one-sheet-per-section.
export async function exportPdfSections(
  columns: { header: string; key: string }[],
  sections: PdfSection[],
  filename: string
) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const marginX = 28
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const usableWidth = pageWidth - marginX * 2
  const colWidth = usableWidth / Math.max(columns.length, 1)
  const rowHeight = 16
  let y = 0

  const charsPerCol = Math.max(4, Math.floor(colWidth / 4.3))
  const clip = (s: string) => (s.length > charsPerCol ? `${s.slice(0, charsPerCol - 1)}…` : s)

  function drawHeader(title: string, rowCount: number) {
    y = 40
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(title, marginX, y)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated ${new Date().toLocaleString()} — ${rowCount} record${rowCount === 1 ? '' : 's'}`, marginX, y + 12)
    y += 30
    doc.setFont('helvetica', 'bold')
    columns.forEach((c, i) => doc.text(clip(c.header), marginX + i * colWidth + 2, y))
    doc.setLineWidth(0.5)
    doc.line(marginX, y + 4, marginX + usableWidth, y + 4)
    y += rowHeight
    doc.setFont('helvetica', 'normal')
  }

  sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) doc.addPage()
    drawHeader(section.title, section.rows.length)
    for (const row of section.rows) {
      if (y > pageHeight - 36) {
        doc.addPage()
        drawHeader(section.title, section.rows.length)
      }
      columns.forEach((c, i) => {
        const val = row[c.key]
        const text = val === null || val === undefined ? '' : String(val)
        doc.text(clip(text), marginX + i * colWidth + 2, y)
      })
      y += rowHeight
    }
  })

  doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

// Single-section convenience wrapper — kept for callers that only ever produce one table.
export async function exportPdfTable(
  title: string,
  columns: { header: string; key: string }[],
  rows: Record<string, unknown>[],
  filename: string
) {
  await exportPdfSections(columns, [{ title, rows }], filename)
}
