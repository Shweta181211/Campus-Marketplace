import 'dotenv/config'
import fs from 'fs'
import Listing from '../models/Listing.js'
import Transaction from '../models/Transaction.js'
import { connectDB, disconnectDB } from '../db.js'

await connectDB()
const listings = await Listing.find({ status: { $in: ['active', 'sold'] }, trainingExportable: true }).lean()
const sales = await Transaction.find({ type: { $in: ['bought', 'sold'] }, status: { $in: ['PAID', 'COMPLETED'] } }).lean()
const rows = listings.map((l) => ({
  isSeed: Boolean(l.isSeed),
  category: l.category,
  brand: l.brand,
  originalPrice: l.originalPrice,
  ageMonths: l.ageMonths,
  condition: l.condition,
  demand: l.demand,
  listingType: l.listingKind || l.type,
  askingPrice: l.price,
  sold: sales.some((t) => String(t.listingId) === String(l._id)),
}))
const out = new URL('../data/export-training.json', import.meta.url)
fs.mkdirSync(new URL('../data', import.meta.url), { recursive: true })
fs.writeFileSync(out, JSON.stringify(rows, null, 2))
console.log(`Exported ${rows.length} listing rows for future retraining`)
await disconnectDB()
