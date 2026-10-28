import 'dotenv/config'
import fs from 'fs'
import Listing from '../models/Listing.js'
import Payment from '../models/Payment.js'
import { connectDB, disconnectDB } from '../db.js'

/**
 * Export REAL campus sales for retraining the price model.
 * A row is only written when we know what the item actually sold for (a verified Payment).
 * Seed/demo listings are skipped. Then run:  npm run ml:train
 */
await connectDB()
const paid = await Payment.find({ status: 'paid', verified: true, isSeed: { $ne: true } }).lean()
const listings = await Listing.find({ _id: { $in: paid.map((p) => p.listingId) }, isSeed: { $ne: true }, trainingExportable: true }).lean()
const byId = new Map(listings.map((l) => [String(l._id), l]))

const rows = []
for (const p of paid) {
  const l = byId.get(String(p.listingId))
  if (!l || !(l.originalPrice >= 80)) continue
  rows.push({
    isSeed: false,
    category: l.category,
    title: l.title,
    brand: l.brand,
    originalPrice: l.originalPrice,
    ageMonths: l.ageMonths,
    condition: l.condition,
    demand: l.demand,
    listingType: 'sale',
    lendUnit: 'day',
    askingPrice: l.askingPrice || l.price,
    soldPrice: p.amount,
  })
}
const out = new URL('../data/export-training.json', import.meta.url)
fs.mkdirSync(new URL('../data', import.meta.url), { recursive: true })
fs.writeFileSync(out, JSON.stringify(rows, null, 2))
console.log(`Exported ${rows.length} real sold listings to server/data/export-training.json`)
console.log(rows.length ? 'Now run: npm run ml:train' : 'No real sales yet — the model keeps using synthetic data.')
await disconnectDB()
