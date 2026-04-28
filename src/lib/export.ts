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
