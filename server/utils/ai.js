import crypto from 'crypto'
import Listing from '../models/Listing.js'
import Transaction from '../models/Transaction.js'
import FraudReport from '../models/FraudReport.js'
import User from '../models/User.js'
import Message from '../models/Message.js'
import Upload from '../models/Upload.js'
import Moderation from '../models/Moderation.js'
import { predictPrice, scoreFraud } from './mlClient.js'
import { contactScore, urgencyScore } from './fraudText.js'
import { linkedAccountCount } from './device.js'
import { generateOtp, hashOtp, otpEquals } from './otp.js'
import { sendEmail } from './email.js'
import { campusFairPrice, sanitizePredictedPrice } from './fairPrice.js'

export function hashText(text) {
  return crypto.createHash('sha256').update(String(text || '').trim().toLowerCase()).digest('hex')
}

export async function recommendPrice(payload) {
  const heuristic = heuristicPrice(payload)
  let out = heuristic
  try {
    const result = await predictPrice(payload)
    if (result?.recommendedPrice != null) out = sanitizePredictedPrice(result, heuristic)
  } catch {
    /* ML down — the formula in fairPrice.js still returns a usable range and is labelled source:'heuristic' */
  }
  return out
}

/**
 * What similar listings on THIS campus are asking right now (live market signal shown next to the model's
 * estimate). Needs at least 4 comparable listings, otherwise returns null instead of a misleading number.
 */
export async function marketComparables({ category, listingType, condition }) {
  try {
    const kind = listingType === 'lend' ? ['lend', 'borrow'] : ['buy', 'sale']
    const rows = await Listing.find({
      category,
      type: { $in: kind },
      condition,
      status: { $in: ['active', 'sold'] },
      price: { $gt: 0 },
    })
      .select('price')
      .limit(200)
      .lean()
    if (rows.length < 4) return null
    const prices = rows.map((r) => Number(r.price)).sort((a, b) => a - b)
    const q = (p) => prices[Math.min(prices.length - 1, Math.floor(p * (prices.length - 1)))]
    return { count: prices.length, median: q(0.5), p25: q(0.25), p75: q(0.75) }
  } catch {
    return null
  }
}

export function heuristicPrice(payload) {
  return campusFairPrice(payload)
}

const HOUR = 60 * 60 * 1000

/**
 * Build the fraud-model payload for a listing (PDF section 6: listing, user and behavioural levels).
 * Counts exclude the listing itself (it is assessed before it is saved, or excluded by _id when re-assessed).
 */
export async function extractFraudFeatures({ listing, seller, extras = {} }) {
  const title = listing.title || ''
  const description = listing.description || ''
  const price = Number(listing.price || listing.askingPrice || 0)
  const original = Number(listing.originalPrice || 0)
  const category = listing.category
  const sellerId = seller?._id
  const notSelf = listing._id ? { _id: { $ne: listing._id } } : {}
  const hashes = (listing.imageHashes || []).filter(Boolean)
  const since = (ms) => new Date(Date.now() - ms)

  const [dupTitle, dupDesc, burst, day, confirmed, open, recentTx, messages1h, reusedListings, reusedUploads, linked, categoryListings] =
    await Promise.all([
      // same title re-posted by this seller, or by anyone in the last 24h (popular items like "Casio fx-991EX"
      // legitimately share titles over a semester, so older listings from other sellers are not counted)
      title
        ? Listing.countDocuments({
            ...notSelf,
            title: new RegExp(`^${escapeRegex(title.trim())}$`, 'i'),
            status: { $ne: 'removed' },
            $or: [{ 'seller.userId': sellerId || null }, { createdAt: { $gte: since(24 * HOUR) } }],
          })
        : 0,
      // copy-pasted descriptions; very short ones ("good condition") are ignored
      listing.descriptionHash && description.trim().length >= 40
        ? Listing.countDocuments({ ...notSelf, descriptionHash: listing.descriptionHash, status: { $ne: 'removed' } })
        : 0,
      sellerId ? Listing.countDocuments({ ...notSelf, 'seller.userId': sellerId, createdAt: { $gte: since(HOUR) } }) : 0,
      sellerId ? Listing.countDocuments({ ...notSelf, 'seller.userId': sellerId, createdAt: { $gte: since(24 * HOUR) } }) : 0,
      sellerId ? FraudReport.countDocuments({ accusedUserId: sellerId, status: 'confirmed' }) : 0,
      sellerId ? FraudReport.countDocuments({ accusedUserId: sellerId, status: 'open' }) : 0,
      sellerId
        ? Transaction.countDocuments({ $or: [{ sellerId }, { lenderId: sellerId }], createdAt: { $gte: since(24 * HOUR) } })
        : 0,
      sellerId ? Message.countDocuments({ fromUserId: sellerId, createdAt: { $gte: since(HOUR) } }) : 0,
      hashes.length && sellerId
        ? Listing.countDocuments({ ...notSelf, imageHashes: { $in: hashes }, 'seller.userId': { $ne: sellerId } })
        : 0,
      hashes.length && sellerId
        ? Upload.distinct('ownerId', { contentHash: { $in: hashes }, ownerId: { $ne: sellerId } }).then((r) => r.length)
        : 0,
      sellerId ? linkedAccountCount(sellerId) : 0,
      // comparable items: same category and a similar original price (x0.5 - x2), so a ₹650 calculator is not
      // compared with ₹40 000 phones that share the "electronics" category
      Listing.find({
        category,
        status: { $in: ['active', 'sold'] },
        ...notSelf,
        ...(original >= 80 ? { originalPrice: { $gte: original * 0.5, $lte: original * 2 } } : {}),
      })
        .select('price')
        .limit(300)
        .lean(),
    ])

  // median of comparables; with fewer than 4 we do not know the local market -> neutral ratio 1
  const comps = categoryListings.map((l) => Number(l.price || 0)).filter((p) => p > 0).sort((a, b) => a - b)
  const median = comps.length >= 4 ? comps[Math.floor(comps.length / 2)] : 0
  const accountAgeDays = seller?.createdAt ? (Date.now() - new Date(seller.createdAt).getTime()) / 86400000 : 30
  const text = `${title}\n${description}`

  return {
    price,
    originalPrice: original,
    fairPrice: Number(listing.recommendedPrice || 0),
    priceRatio: median && price ? price / median : 1,
    originalRatio: original ? price / original : 1,
    titleLength: title.length,
    descriptionLength: description.length,
    duplicateTitleCount: dupTitle,
    duplicateContentCount: dupDesc,
    imageCount: (listing.images || []).length,
    reusedImageCount: Math.max(reusedListings, reusedUploads),
    contactInDescription: contactScore(text),
    urgencyScore: urgencyScore(text),
    accountAgeDays,
    verified: seller?.verified ? 1 : 0,
    linkedAccounts: linked,
    confirmedReports: Math.max(confirmed, seller?.confirmedReports || 0),
    openReports: open,
    trustScore: Number(seller?.trustScore ?? 55),
    listingBurst1h: burst,
    listings24h: day,
    messages1h,
    recentTransactions24h: recentTx,
    ...extras,
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const DECISIONS = {
  LOW: { action: 'PUBLISH', text: 'Published normally.' },
  MEDIUM: { action: 'VERIFY', text: 'Published after the seller completes an extra verification step (email OTP).' },
  HIGH: { action: 'HOLD', text: 'Held for admin review. It is not visible to buyers yet.' },
}

/** Rule-based fallback used only when the Python ML service is down. Same thresholds as the model. */
export function heuristicFraud(f) {
  const signals = []
  let score = 0.1
  const add = (cond, name, w) => {
    if (cond) {
      signals.push(name)
      score += w
    }
  }
  add(f.duplicateTitleCount >= 2, 'duplicate_listing_title', 0.2)
  add(f.duplicateContentCount >= 2, 'duplicate_description', 0.15)
  add(f.reusedImageCount >= 1, 'reused_images', 0.2)
  add(f.listingBurst1h >= 4 && f.accountAgeDays < 60, 'listing_burst', 0.2)
  add(f.confirmedReports > 0, 'prior_confirmed_reports', 0.3)
  add(f.openReports >= 2, 'multiple_open_reports', 0.1)
  add(f.linkedAccounts >= 2, 'multiple_accounts_same_device', 0.2)
  add(f.contactInDescription >= 1, 'off_platform_contact_or_payment', 0.15)
  add(f.messages1h >= 25, 'messaging_spike', 0.15)
  const extreme =
    (f.fairPrice > 2000 && f.price > 0 && f.price < 0.35 * f.fairPrice) ||
    (f.originalPrice > 2000 && f.originalRatio > 0 && f.originalRatio < 0.15)
  // a cheap price alone is not fraud: it only counts together with another signal
  add(extreme && signals.length > 0, 'extreme_price_deviation', 0.2)
  add(f.accountAgeDays < 2 && f.listingBurst1h >= 2, 'new_account_burst', 0.15)
  score = Math.max(0, Math.min(0.95, score))
  const level = levelFromScore(score)
  return {
    fraudRiskScore: Math.round(score * 100) / 100,
    fraudRiskLevel: level,
    fraudSignals: signals.length ? signals : ['no_strong_anomaly'],
    reasons: [],
    decision: DECISIONS[level].action,
    decisionText: DECISIONS[level].text,
    source: 'heuristic',
  }
}

export async function assessListingFraud({ listing, seller }) {
  const features = await extractFraudFeatures({ listing, seller })
  try {
    const ml = await scoreFraud(features)
    const score = Number(ml.fraudRiskScore ?? ml.score ?? 0)
    const raw = String(ml.fraudRiskLevel || ml.level || levelFromScore(score)).toUpperCase()
    const level = ['LOW', 'MEDIUM', 'HIGH'].includes(raw) ? raw : levelFromScore(score)
    return {
      fraudRiskScore: score,
      fraudRiskLevel: level,
      fraudSignals: ml.fraudSignals || ml.signals || [],
      reasons: Array.isArray(ml.reasons) ? ml.reasons : [],
      decision: ml.decision || DECISIONS[level].action,
      decisionText: ml.decisionText || DECISIONS[level].text,
      source: 'ml',
      features,
    }
  } catch {
    return { ...heuristicFraud(features), features }
  }
}

function levelFromScore(score) {
  if (score >= 0.7) return 'HIGH'
  if (score >= 0.4) return 'MEDIUM'
  return 'LOW'
}

/**
 * Combined decision layer (PDF sections 6-7):  LOW -> publish,  MEDIUM -> extra verification (seller confirms
 * with an email OTP before the listing goes public),  HIGH -> hold + admin review.
 * Returns { listing, devOtp } (devOtp only when DEV_RETURN_OTP=true).
 */
export async function applyFraudDecision(listingDoc, assessment, seller) {
  listingDoc.fraudRiskScore = assessment.fraudRiskScore
  listingDoc.fraudRiskLevel = assessment.fraudRiskLevel
  listingDoc.fraudSignals = assessment.fraudSignals
  listingDoc.fraudReasons = assessment.reasons || []
  listingDoc.fraudSource = assessment.source
  listingDoc.fraudFeatures = assessment.features || null
  listingDoc.fraudAction = DECISIONS[assessment.fraudRiskLevel].action

  let devOtp = null
  if (assessment.fraudRiskLevel === 'HIGH') {
    listingDoc.status = 'held'
    listingDoc.heldReason = 'fraud'
    listingDoc.fraudDecision = 'pending'
  } else if (assessment.fraudRiskLevel === 'MEDIUM') {
    listingDoc.status = 'verification'
    listingDoc.fraudDecision = 'pending'
    devOtp = await issueListingOtp(listingDoc, seller)
  } else {
    listingDoc.status = 'active'
    listingDoc.fraudDecision = 'none'
  }

  await listingDoc.save()

  if (assessment.fraudRiskLevel !== 'LOW') {
    await Moderation.create({
      listing: listingDoc.title,
      risk: assessment.fraudRiskLevel === 'HIGH' ? 'High' : 'Medium',
      reason: (assessment.fraudSignals || []).join(', ') || 'Model flagged listing for review',
      seller: seller?.name || listingDoc.seller?.name || 'Unknown',
      sellerUserId: seller?._id,
      listingId: listingDoc._id,
      fraudRiskScore: assessment.fraudRiskScore,
      signals: assessment.fraudSignals,
      reasons: assessment.reasons || [],
      source: assessment.source,
      status: 'pending',
    })
  }

  return { listing: listingDoc, devOtp }
}

const LISTING_OTP_TTL_MS = 30 * 60 * 1000

/** Email a 6-digit code to the seller; the listing stays hidden until they confirm it. */
export async function issueListingOtp(listingDoc, seller) {
  const otp = generateOtp()
  const email = seller?.email || ''
  listingDoc.verifyOtpHash = hashOtp(otp, `${email}:${listingDoc._id}`)
  listingDoc.verifyOtpExpiresAt = new Date(Date.now() + LISTING_OTP_TTL_MS)
  if (email) {
    await sendEmail(
      email,
      'Confirm your Campus Marketplace listing',
      `Your listing "${listingDoc.title}" needs one extra check before it goes live. Code: ${otp} (valid 30 minutes).`
    ).catch(() => {})
  }
  return process.env.DEV_RETURN_OTP === 'true' ? otp : null
}

export function listingOtpMatches(listingDoc, seller, otp) {
  if (!listingDoc.verifyOtpHash || !listingDoc.verifyOtpExpiresAt) return false
  if (new Date(listingDoc.verifyOtpExpiresAt).getTime() < Date.now()) return false
  return otpEquals(listingDoc.verifyOtpHash, String(otp || '').trim(), `${seller.email}:${listingDoc._id}`)
}

export { User }
