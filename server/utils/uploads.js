import Upload from '../models/Upload.js'
import { removeImage, MAX_IMAGES_PER_LISTING } from './storage.js'

/**
 * Turn the URLs sent by the client into stored assets.
 * Only URLs that the same user uploaded through /api/uploads/images (and that are not attached to a
 * different listing) are accepted, so nobody can hot-link random URLs or someone else's photos.
 */
export async function resolveListingImages(urls, ownerId, listingId = null) {
  const list = Array.isArray(urls) ? urls.filter((u) => typeof u === 'string' && u) : []
  const unique = [...new Set(list)].slice(0, MAX_IMAGES_PER_LISTING)
  if (!unique.length) return { assets: [], error: null }
  const found = await Upload.find({ url: { $in: unique }, ownerId })
  const byUrl = new Map(found.map((u) => [u.url, u]))
  const assets = []
  for (const url of unique) {
    const doc = byUrl.get(url)
    if (!doc || (doc.listingId && String(doc.listingId) !== String(listingId))) {
      return { assets: [], error: 'One or more images were not uploaded by you or are already used. Please re-upload them.' }
    }
    assets.push(doc)
  }
  return { assets, error: null }
}

export async function attachAssets(assets, listingId) {
  if (!assets.length) return
  await Upload.updateMany({ _id: { $in: assets.map((a) => a._id) } }, { $set: { listingId } })
}

export async function deleteAssets(assets) {
  for (const a of assets) {
    await removeImage({ publicId: a.publicId, provider: a.provider })
    await Upload.deleteOne({ _id: a._id })
  }
}

export async function deleteListingImages(listingId) {
  const assets = await Upload.find({ listingId })
  await deleteAssets(assets)
  return assets.length
}

/** Uploads that never got attached to a listing (user closed the tab) are removed after 24h. */
export async function cleanupOrphanUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  const stale = await Upload.find({ listingId: null, createdAt: { $lt: new Date(Date.now() - maxAgeMs) } }).limit(100)
  await deleteAssets(stale)
  return stale.length
}
