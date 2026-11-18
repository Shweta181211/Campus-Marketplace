import Transaction from '../models/Transaction.js'
import Review from '../models/Review.js'
import Moderation from '../models/Moderation.js'

export function starsFromScore(score0to100) {
  return Math.round((Math.max(0, Math.min(100, score0to100)) / 20) * 10) / 10
}

export async function recomputeTrustScore(userId) {
  const user = await (await import('../models/User.js')).default.findById(userId)
  if (!user) return 0

  const [completed, overdue, reviews, reports] = await Promise.all([
    Transaction.countDocuments({
      $or: [{ borrowerId: userId }, { lenderId: userId }, { buyerId: userId }, { sellerId: userId }],
      status: { $in: ['COMPLETED', 'completed'] },
    }),
    Transaction.countDocuments({
      $or: [{ borrowerId: userId }, { lenderId: userId }],
      overdueStatus: true,
    }),
    Review.find({ forUserId: userId }).lean(),
    Moderation.countDocuments({
      sellerUserId: userId,
      risk: { $in: ['High', 'HIGH'] },
      status: { $ne: 'dismissed' },
    }),
  ])

  const accountAgeDays = user.createdAt
    ? Math.max(0, (Date.now() - new Date(user.createdAt).getTime()) / 86400000)
    : 0
  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length
    : 3.5
  const onTimeLoans = await Transaction.countDocuments({
    borrowerId: userId,
    status: 'COMPLETED',
    overdueStatus: { $ne: true },
  })

  let score = 40
  if (user.verificationStatus === 'verified' || user.verified) score += 15
  score += Math.min(20, completed * 2)
  score += Math.min(10, (avgRating - 3) * 8)
  score += Math.min(8, onTimeLoans * 2)
  score += Math.min(7, accountAgeDays / 30)
  score -= Math.min(25, overdue * 8)
  score -= Math.min(20, reports * 10)
  if (user.confirmedReports) score -= Math.min(15, user.confirmedReports * 5)

  score = Math.round(Math.max(0, Math.min(100, score)))
  user.trustScore = score
  user.trust = starsFromScore(score)
  user.rating = Math.round(avgRating * 10) / 10
  user.reviewCount = reviews.length
  await user.save()
  return score
}
