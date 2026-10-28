import 'dotenv/config'
import Listing from '../models/Listing.js'
import Upload from '../models/Upload.js'
import { connectDB, disconnectDB } from '../db.js'
import { saveImage, sniffImage, storageProvider } from '../utils/storage.js'

/**
 * One-off: older listings stored photos as base64 data URLs inside MongoDB.
 * This uploads them to the configured storage provider and replaces them with URLs.
 *   node scripts/migrateImagesToCloud.js
 */
await connectDB()
console.log(`Storage provider: ${storageProvider()}`)
const listings = await Listing.find({ images: { $elemMatch: { $regex: '^data:image' } } })
let moved = 0
for (const listing of listings) {
  const next = []
  for (const img of listing.images) {
    if (!String(img).startsWith('data:image')) {
      next.push(img)
      continue
    }
    const buf = Buffer.from(String(img).split(',')[1] || '', 'base64')
    if (!sniffImage(buf)) continue
    const ownerId = listing.seller?.userId
    const asset = await saveImage(buf, { ownerId, kind: 'listings' })
    await Upload.create({ ...asset, ownerId, listingId: listing._id })
    next.push(asset.url)
    moved += 1
  }
  listing.images = next
  await listing.save()
}
console.log(`Migrated ${moved} image(s) across ${listings.length} listing(s).`)
await disconnectDB()
