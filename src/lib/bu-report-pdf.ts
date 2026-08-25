import { existsSync } from 'fs'

// Server-side HTML → PDF rendering via headless Chromium. Two entirely different Chromium
// binaries are involved depending on where this runs, because @sparticuz/chromium's binary is
// built for Vercel's serverless Linux runtime and does not run on a local Windows/Mac dev
// machine: in production (on Vercel) it launches that bundled Chromium via puppeteer-core; in
// local dev it drives an already-installed system Chrome/Edge instead, so this whole pipeline —
// including the actual PDF bytes — can be verified from a dev machine before it ever reaches a
// real send.
const LOCAL_BROWSER_CANDIDATES = [
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

function findLocalBrowserExecutable(): string {
  const found = LOCAL_BROWSER_CANDIDATES.find((p) => existsSync(p))
  if (!found) {
    throw new Error('No local Chrome/Edge install found for PDF preview. Install Chrome or Edge, or test this on Vercel directly.')
  }
  return found
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function launchBrowser(): Promise<any> {
  const puppeteer = await import('puppeteer-core')
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }
  return puppeteer.launch({ executablePath: findLocalBrowserExecutable(), headless: true })
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
