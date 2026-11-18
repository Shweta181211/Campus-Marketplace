import 'dotenv/config'
import fs from 'fs'
import Listing from '../models/Listing.js'
import FraudReport from '../models/FraudReport.js'
import { connectDB, disconnectDB } from '../db.js'

/**
 * Export REAL listings for retraining the fraud model (PDF section 6: "Logistic Regression or Random Forest can
 * be introduced later when sufficient confirmed-fraud labels are collected from admin reviews").
 *
 *   label 1  admin rejected the listing, or a report about it was confirmed
 *   label 0  admin approved a flagged listing, or the listing sold normally with no report
 *   null     everything else (still useful: unlabelled rows refine the Isolation Forest's idea of "normal")
 *
 * Every listing stores the feature snapshot it was scored with (fraudFeatures), so no feature drift.
 * Then run: npm run ml:train
 */
await connectDB()
const listings = await Listing.find({ isSeed: { $ne: true }, fraudFeatures: { $ne: null } }).lean()
const confirmed = new Set(
  (await FraudReport.find({ status: 'confirmed', listingId: { $ne: null } }).select('listingId').lean()).map((r) => String(r.listingId))
)
const reported = new Set((await FraudReport.find({ listingId: { $ne: null } }).select('listingId').lean()).map((r) => String(r.listingId)))

const rows = listings.map((l) => {
  let label = null
  if (l.fraudDecision === 'rejected' || confirmed.has(String(l._id))) label = 1
  else if (l.fraudDecision === 'approved' || (l.status === 'sold' && !reported.has(String(l._id)))) label = 0
  return { listingId: String(l._id), label, features: l.fraudFeatures }
})
const out = new URL('../data/fraud-training.json', import.meta.url)
fs.mkdirSync(new URL('../data', import.meta.url), { recursive: true })
fs.writeFileSync(out, JSON.stringify(rows, null, 2))
const pos = rows.filter((r) => r.label === 1).length
const neg = rows.filter((r) => r.label === 0).length
console.log(`Exported ${rows.length} listings (${pos} confirmed fraud, ${neg} legit, ${rows.length - pos - neg} unlabelled) to server/data/fraud-training.json`)
console.log('Now run: npm run ml:train  (the RandomForest stage switches on at >= 10 of each label)')
await disconnectDB()
