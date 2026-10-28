/**
 * Image storage with two interchangeable providers:
 *
 *   cloudinary  - used automatically when CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME /
 *                 CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) is configured.  Files live in
 *                 the cloud, are resized on upload and served from Cloudinary's CDN.
 *   local       - development fallback that writes to server/uploads and serves /uploads/*.
 *                 NOT durable on hosts with ephemeral disks (Render/Heroku/...), so the UI and
 *                 /api/uploads/status label it clearly as "local".
 *
 * Listings only ever store URLs (never base64) so MongoDB documents stay small.
 */
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { v2 as cloudinary } from 'cloudinary'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(__dirname, '..', 'uploads')
export const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_MB || 5) * 1024 * 1024
export const MAX_IMAGES_PER_LISTING = 6

let configured = false

export function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  )
}

export function storageProvider() {
  if (process.env.STORAGE_PROVIDER === 'local') return 'local'
  return cloudinaryConfigured() ? 'cloudinary' : 'local'
}

function ensureCloudinary() {
  if (configured) return
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
  }
  cloudinary.config({ secure: true })
  configured = true
}

/** Identify the real image type from magic bytes (never trust the client's MIME type or filename). */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' }
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return { mime: 'image/gif', ext: 'gif' }
  return null
}

function uploadToCloudinary(buffer, folder) {
  ensureCloudinary()
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        // Resize before storing so a 12 MB phone photo does not cost 12 MB of cloud storage.
        transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }],
        overwrite: false,
        unique_filename: true,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    )
    stream.end(buffer)
  })
}

export function publicBaseUrl() {
  return (process.env.PUBLIC_API_URL || '').replace(/\/$/, '')
}

/** @returns {{url, publicId, provider, width, height, bytes, format}} */
export async function saveImage(buffer, { ownerId, kind }) {
  if (storageProvider() === 'cloudinary') {
    const folder = `${process.env.CLOUDINARY_FOLDER || 'campus-marketplace'}/${kind || 'listings'}`
    const r = await uploadToCloudinary(buffer, folder)
    return {
      url: r.secure_url,
      publicId: r.public_id,
      provider: 'cloudinary',
      width: r.width,
      height: r.height,
      bytes: r.bytes,
      format: r.format,
    }
  }

  const type = sniffImage(buffer)
  const dir = path.join(LOCAL_UPLOAD_DIR, String(ownerId))
  await fs.mkdir(dir, { recursive: true })
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${type?.ext || 'jpg'}`
  await fs.writeFile(path.join(dir, name), buffer)
  return {
    url: `${publicBaseUrl()}/uploads/${ownerId}/${name}`,
    publicId: `${ownerId}/${name}`,
    provider: 'local',
    width: 0,
    height: 0,
    bytes: buffer.length,
    format: type?.ext || 'jpg',
  }
}

export async function removeImage({ publicId, provider }) {
  if (!publicId) return false
  try {
    if (provider === 'cloudinary') {
      ensureCloudinary()
      const r = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })
      return r.result === 'ok' || r.result === 'not found'
    }
    const safe = path.normalize(publicId).replace(/^(\.\.(\/|\\|$))+/, '')
    await fs.unlink(path.join(LOCAL_UPLOAD_DIR, safe))
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return true
    console.warn('removeImage failed', publicId, err.message)
    return false
  }
}
