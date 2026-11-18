import crypto from 'crypto'

/**
 * AES-256-GCM encryption for stored user coordinates (PDF: "Encrypt stored location data").
 * Key: LOCATION_ENC_KEY (64 hex chars) or, if missing, derived from JWT_SECRET so dev setups keep working.
 * Stored format: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
 */
function key() {
  const hex = process.env.LOCATION_ENC_KEY
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex')
  return crypto
    .createHash('sha256')
    .update(`location:${process.env.JWT_SECRET || 'dev-jwt-secret-change-me'}`)
    .digest()
}

export function encryptLocation(value) {
  if (value == null || value === '') return undefined
  if (typeof value === 'string') return value.startsWith('v1:') ? value : undefined
  const c = value.coordinates
  if (!Array.isArray(c) || c.length !== 2 || !c.every((n) => Number.isFinite(Number(n)))) return undefined
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(JSON.stringify([Number(c[0]), Number(c[1])]), 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`
}

export function decryptLocation(stored) {
  if (!stored || typeof stored !== 'string' || !stored.startsWith('v1:')) return undefined
  try {
    const [, iv, tag, data] = stored.split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
    const [lon, lat] = JSON.parse(plain)
    return { type: 'Point', coordinates: [lon, lat] }
  } catch {
    return undefined // wrong key / tampered -> treat as "no location"
  }
}
