import Transaction from '../models/Transaction.js'
import Review from '../models/Review.js'
import Moderation from '../models/Moderation.js'
import FraudReport from '../models/FraudReport.js'
import User from '../models/User.js'
import { audit } from './audit.js'

/**
 * Trust Score (PDF section 10):   T = wV·V + wR·R + wC·C + wO·O + wA·A − wF·F   (+ base), normalised to 0-100
 *
 *   V  verification            1 if the college email is verified
 *   R  reviews                 average rating mapped to 0..1, shrunk toward neutral (0.5) when there are few reviews
 *   C  completed transactions  1 − e^(−n/5): first trades count most, then it saturates
 *   O  on-time returns         on-time / (on-time + overdue) for borrow/lend; 0.5 (neutral) with no loan history
 *   A  account age & activity  min(1, days/180)
 *   F  negative reports        confirmed reports weigh 1.0, admin-upheld high-risk flags 0.5, OPEN (unverified)
 *                              complaints only 0.15 — confirmed reports hurt far more than unverified ones
 *
 * Trust ≠ fraud risk: trust is accumulated history, fraud risk is the model's view of a single listing/activity.
 */
export const TRUST_WEIGHTS = { base: 10, V: 20, R: 25, C: 20, O: 15, A: 10, F: 40 }

export function trustBand(score) {
  if (score >= 80) return { band: '80-100', label: 'Highly trusted marketplace history' }
  if (score >= 60) return { band: '60-79', label: 'Good / established history' }
  if (score >= 40) return { band: '40-59', label: 'Limited or mixed history' }
  return { band: '0-39', label: 'Low trust — extra caution or verification may be appropriate' }
}

export function starsFromScore(score0to100) {
  return Math.round((Math.max(0, Math.min(100, score0to100)) / 20) * 10) / 10
}

/** Pure function so it can be unit-tested and shown in the UI. */
export function computeTrust(inputs) {
  const { verified, avgRating, reviewCount, completed, onTimeLoans, overdueLoans, accountAgeDays, confirmedReports, upheldFlags, openReports } = inputs
  const W = TRUST_WEIGHTS
  const V = verified ? 1 : 0
  const shrink = Math.min(1, reviewCount / 5)
  const R = reviewCount ? shrink * ((avgRating - 1) / 4) + (1 - shrink) * 0.5 : 0.5
  const C = 1 - Math.exp(-completed / 5)
  const loans = onTimeLoans + overdueLoans
  const O = loans ? onTimeLoans / loans : 0.5
  const A = Math.min(1, accountAgeDays / 180)
  const F = Math.min(1, (confirmedReports * 1.0 + upheldFlags * 0.5 + openReports * 0.15) / 3)
  const raw = W.base + W.V * V + W.R * R + W.C * C + W.O * O + W.A * A - W.F * F
  const score = Math.round(Math.max(0, Math.min(100, raw)))
  const r2 = (x) => Math.round(x * 100) / 100
  return {
    score,
    components: { V: r2(V), R: r2(R), C: r2(C), O: r2(O), A: r2(A), F: r2(F) },
    contributions: {
      base: W.base,
      verification: r2(W.V * V),
      reviews: r2(W.R * R),
      completedTransactions: r2(W.C * C),
      onTimeReturns: r2(W.O * O),
      accountAge: r2(W.A * A),
      negativeReports: r2(-W.F * F),
    },
  }
}

export async function trustInputs(userId) {
  const user = await User.findById(userId)
  if (!user) return null
  const party = { $or: [{ borrowerId: userId }, { lenderId: userId }, { buyerId: userId }, { sellerId: userId }] }
  const [completed, overdueLoans, onTimeLoans, reviews, upheldFlags, openReports, confirmedReports] = await Promise.all([
    Transaction.countDocuments({ ...party, status: { $in: ['COMPLETED', 'completed'] } }),
    Transaction.countDocuments({ borrowerId: userId, overdueStatus: true }),
    Transaction.countDocuments({ borrowerId: userId, status: 'COMPLETED', overdueStatus: { $ne: true } }),
    Review.find({ forUserId: userId }).select('rating').lean(),
    Moderation.countDocuments({ sellerUserId: userId, risk: { $in: ['High', 'HIGH'] }, status: { $in: ['rejected', 'reviewed'] } }),
    FraudReport.countDocuments({ accusedUserId: userId, status: 'open' }),
    FraudReport.countDocuments({ accusedUserId: userId, status: 'confirmed' }),
  ])
  const accountAgeDays = user.createdAt ? Math.max(0, (Date.now() - new Date(user.createdAt).getTime()) / 86400000) : 0
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length : 0
  return {
    user,
    inputs: {
      verified: user.verificationStatus === 'verified' || user.verified,
      avgRating,
      reviewCount: reviews.length,
      completed,
      onTimeLoans,
      overdueLoans,
      accountAgeDays,
      confirmedReports: Math.max(confirmedReports, user.confirmedReports || 0),
      upheldFlags,
      openReports,
    },
  }
}

/**
 * Recompute and store a user's trust score. Every change is written to the audit trail with a reason.
 * @returns {Promise<number>} the new score
 */
export async function recomputeTrustScore(userId, { reason = 'recomputed', actor = null } = {}) {
  const data = await trustInputs(userId)
  if (!data) return 0
  const { user, inputs } = data
  const result = computeTrust(inputs)
  const before = user.trustScore
  user.trustScore = result.score
  user.trust = starsFromScore(result.score)
  user.rating = inputs.reviewCount ? Math.round(inputs.avgRating * 10) / 10 : user.rating
  user.reviewCount = inputs.reviewCount
  await user.save()
  if (before !== result.score) {
    await audit('trust_score_changed', {
      actor,
      targetUserId: user._id,
      before: { trustScore: before },
      after: { trustScore: result.score, components: result.components },
      reason,
    })
  }
  return result.score
}
