import crypto from 'crypto'
import Listing from '../models/Listing.js'
import Transaction from '../models/Transaction.js'
import FraudReport from '../models/FraudReport.js'
import User from '../models/User.js'
import { predictPrice, scoreFraud } from './mlClient.js'
import { campusFairPrice, sanitizePredictedPrice } from './fairPrice.js'

export function hashText(text) {
  return crypto.createHash('sha256').update(String(text || '').trim().toLowerCase()).digest('hex')
}

export async function recommendPrice(payload) {
  const heuristic = heuristicPrice(payload)
  try {
    const result = await predictPrice(payload)
    if (result?.recommendedPrice != null) return sanitizePredictedPrice(result, heuristic)
  } catch {
    /* ML down — campus calculator still returns a usable range */
  }
  return heuristic
}

export function heuristicPrice(payload) {
  return campusFairPrice(payload)
}

export async function extractFraudFeatures({ listing, seller, extras = {} }) {
  const title = listing.title || ''
  const description = listing.description || ''
  const price = Number(listing.price || listing.askingPrice || 0)
  const original = Number(listing.originalPrice || 0)
  const category = listing.category

  const [dupTitle, dupDesc, burst, reports, recentTx] = await Promise.all([
    Listing.countDocuments({
      title: new RegExp(`^${escapeRegex(title)}$`, 'i'),
      status: { $ne: 'removed' },
    }),
    listing.descriptionHash
      ? Listing.countDocuments({ descriptionHash: listing.descriptionHash })
      : 0,
    seller?._id
      ? Listing.countDocuments({
          'seller.userId': seller._id,
          createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
        })
      : 0,
    seller?._id ? FraudReport.countDocuments({ accusedUserId: seller._id, status: 'confirmed' }) : 0,
    seller?._id
      ? Transaction.countDocuments({
          $or: [{ sellerId: seller._id }, { lenderId: seller._id }],
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        })
      : 0,
  ])

  const categoryListings = await Listing.find({ category, status: 'active' }).select('price').lean()
  const mean =
    categoryListings.length > 0
      ? categoryListings.reduce((s, l) => s + Number(l.price || 0), 0) / categoryListings.length
      : price || 1
  const priceRatio = mean ? price / mean : 1
  const originalRatio = original ? price / original : 1
  const accountAgeDays = seller?.createdAt
    ? (Date.now() - new Date(seller.createdAt).getTime()) / 86400000
    : 30

  return {
    price,
    originalPrice: original,
    priceRatio,
    originalRatio,
    titleLength: title.length,
    descriptionLength: description.length,
    duplicateTitleCount: dupTitle,
    duplicateContentCount: dupDesc,
    listingBurst1h: burst,
    confirmedReports: reports,
    recentTransactions24h: recentTx,
    accountAgeDays,
    verified: seller?.verified ? 1 : 0,
    ...extras,
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function heuristicFraud(features) {
  const signals = []
  let score = 0.12
  if (features.duplicateTitleCount > 2) {
    signals.push('duplicate_listing_title')
    score += 0.22
  }
  if (features.duplicateContentCount > 2) {
    signals.push('duplicate_description')
    score += 0.18
  }
  if (features.listingBurst1h >= 4) {
    signals.push('listing_burst')
    score += 0.2
  }
  if (features.confirmedReports > 0) {
    signals.push('prior_confirmed_reports')
    score += 0.25
  }
  if (features.originalRatio > 0 && features.originalRatio < 0.15 && features.originalPrice > 2000) {
    signals.push('extreme_price_deviation')
    score += 0.18
  }
  if (features.accountAgeDays < 1 && features.listingBurst1h >= 2) {
    signals.push('new_account_burst')
    score += 0.15
  }
  if (features.titleLength < 4) {
    signals.push('thin_listing_content')
    score += 0.08
  }
  score = Math.max(0, Math.min(0.95, score))
  const level = score >= 0.7 ? 'HIGH' : score >= 0.4 ? 'MEDIUM' : 'LOW'
  return {
    fraudRiskScore: Math.round(score * 100) / 100,
    fraudRiskLevel: level,
    fraudSignals: signals.length ? signals : ['no_strong_anomaly'],
    source: 'heuristic',
  }
}

export async function assessListingFraud({ listing, seller }) {
  const features = await extractFraudFeatures({ listing, seller })
  try {
    const ml = await scoreFraud(features)
    const score = Number(ml.fraudRiskScore ?? ml.score ?? 0)
    const level = (ml.fraudRiskLevel || ml.level || levelFromScore(score)).toUpperCase()
    return {
      fraudRiskScore: score,
      fraudRiskLevel: ['LOW', 'MEDIUM', 'HIGH'].includes(level) ? level : levelFromScore(score),
      fraudSignals: ml.fraudSignals || ml.signals || [],
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

export async function applyFraudDecision(listingDoc, assessment, seller) {
  listingDoc.fraudRiskScore = assessment.fraudRiskScore
  listingDoc.fraudRiskLevel = assessment.fraudRiskLevel
  listingDoc.fraudSignals = assessment.fraudSignals
  listingDoc.fraudDecision = 'pending'

  if (assessment.fraudRiskLevel === 'HIGH') {
    listingDoc.status = 'held'
    listingDoc.fraudDecision = 'pending'
  } else {
    listingDoc.status = 'active'
    listingDoc.fraudDecision = 'none'
  }

  await listingDoc.save()

  if (assessment.fraudRiskLevel !== 'LOW') {
    const Moderation = (await import('../models/Moderation.js')).default
    await Moderation.create({
      listing: listingDoc.title,
      risk: assessment.fraudRiskLevel === 'HIGH' ? 'High' : 'Medium',
      reason: (assessment.fraudSignals || []).join(', ') || 'Model flagged listing for review',
      seller: seller?.name || listingDoc.seller?.name || 'Unknown',
      sellerUserId: seller?._id,
      listingId: listingDoc._id,
      fraudRiskScore: assessment.fraudRiskScore,
      signals: assessment.fraudSignals,
      status: 'pending',
    })
  }

  return listingDoc
}

export { User }
