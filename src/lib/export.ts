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

// Plain-grid table PDF — no autotable dependency (not installed), just jsPDF's own text/line
// primitives. Columns are evenly split across the usable page width and each cell's text is
// clipped to fit (with an ellipsis) rather than wrapped, keeping every row a fixed, predictable
// height so page breaks are simple to compute.
export async function exportPdfTable(
  title: string,
  columns: { header: string; key: string }[],
  rows: Record<string, unknown>[],
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

  function drawHeader() {
    y = 40
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(title, marginX, y)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`Generated ${new Date().toLocaleString()} — ${rows.length} record${rows.length === 1 ? '' : 's'}`, marginX, y + 12)
    y += 30
    doc.setFont('helvetica', 'bold')
    columns.forEach((c, i) => doc.text(clip(c.header), marginX + i * colWidth + 2, y))
    doc.setLineWidth(0.5)
    doc.line(marginX, y + 4, marginX + usableWidth, y + 4)
    y += rowHeight
    doc.setFont('helvetica', 'normal')
  }

  drawHeader()
  for (const row of rows) {
    if (y > pageHeight - 36) {
      doc.addPage()
      drawHeader()
    }
    columns.forEach((c, i) => {
      const val = row[c.key]
      const text = val === null || val === undefined ? '' : String(val)
      doc.text(clip(text), marginX + i * colWidth + 2, y)
    })
    y += rowHeight
  }

  doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
