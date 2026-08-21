import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

// Encrypts small secrets (currently just the SMTP password) before they're written to the
// database, using a key derived from AUTH_SECRET — already required for NextAuth session
// signing, so this needs no new environment variable. AES-256-GCM: random 12-byte IV per value,
// auth tag detects tampering, everything packed into one base64 string prefixed "enc:v1:".
const PREFIX = 'enc:v1:'

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set — required to encrypt/decrypt stored secrets.')
  return scryptSync(secret, 'meristem-secret-crypto', 32)
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

// Values saved before this encryption layer existed are stored as plain text with no prefix —
// returned as-is so already-configured SMTP credentials keep working without the admin having
// to re-enter anything. Every value saved from now on goes through encryptSecret() above.
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12)
  const authTag = raw.subarray(12, 28)
  const encrypted = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
