// PNG/JPG capture (per slide) + PDF/ZIP bundling for the report export panel.
// Reuses the same html-to-image approach as ImageExport.tsx.

export async function captureSlidePng(el: HTMLElement): Promise<Blob> {
  const { toPng } = await import('html-to-image')
  const dataUrl = await toPng(el, { quality: 1, pixelRatio: 2, backgroundColor: '#ffffff' })
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function captureSlideJpegDataUrl(el: HTMLElement): Promise<string> {
  const { toJpeg } = await import('html-to-image')
  return toJpeg(el, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' })
}

/** Bundle every slide as a JPG inside one .zip. */
export async function exportSlidesAsJpgZip(slideEls: HTMLElement[], titles: string[], zipFilename: string) {
  const files: { name: string; blob: Blob }[] = []
  for (let i = 0; i < slideEls.length; i++) {
    const dataUrl = await captureSlideJpegDataUrl(slideEls[i])
    const blob = await (await fetch(dataUrl)).blob()
    files.push({ name: `Slide${i + 1}_${titles[i].replace(/[^\w]+/g, '_')}.jpg`, blob })
  }
  await bundleZip(files, zipFilename)
}

/** One multi-page PDF, one slide per page, at the deck's native 960x540pt (13.333in x 7.5in) size. */
export async function exportSlidesAsPdf(slideEls: HTMLElement[], filename: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540] })
  for (let i = 0; i < slideEls.length; i++) {
    if (i > 0) pdf.addPage([960, 540], 'landscape')
    const dataUrl = await captureSlideJpegDataUrl(slideEls[i])
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 960, 540)
  }
  pdf.save(filename)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadSlidePng(el: HTMLElement, filename: string) {
  const blob = await captureSlidePng(el)
  downloadBlob(blob, filename)
}

export async function bundleZip(files: { name: string; blob: Blob }[], zipFilename: string) {
  const JSZipMod = await import('jszip')
  const JSZip = JSZipMod.default ?? JSZipMod
  const zip = new JSZip()
  files.forEach((f) => zip.file(f.name, f.blob))
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, zipFilename)
}
