import { getAccessToken } from '@/lib/google-sheets'

export interface DriveUploadResult {
  fileId: string
  webViewLink: string
}

// Uploads one file into a Drive folder already shared with the service account as Editor (same
// sharing pattern as the spreadsheet). Uses the simple multipart upload endpoint — fine for the
// survey attachment sizes this is built for (certificates, slide decks), not large media.
export async function uploadFileToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBuffer: Buffer
): Promise<DriveUploadResult> {
  const accessToken = await getAccessToken()

  const boundary = `boundary_${Date.now()}`
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] })
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        `Cannot upload to this Drive folder — share it with the service account as Editor first (folder ID: ${folderId}).`
      )
    }
    throw new Error(`Drive upload failed (${res.status}): ${errBody.slice(0, 200)}`)
  }

  const data = (await res.json()) as { id: string; webViewLink: string }
  return { fileId: data.id, webViewLink: data.webViewLink }
}
