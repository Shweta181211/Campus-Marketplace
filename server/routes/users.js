import { Router } from 'express'
import User from '../models/User.js'
import Review from '../models/Review.js'
import { requireAuth, requireVerified, publicUser } from '../middleware/auth.js'
import { recomputeTrustScore } from '../utils/trust.js'

const router = Router()

router.get('/me', requireAuth, async (req, res) => {
  res.json(publicUser(req.user))
})

router.get('/:id/trust-score', requireAuth, requireVerified, async (req, res) => {
  try {
    const score = await recomputeTrustScore(req.params.id)
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({
      userId: user._id.toString(),
      trustScore: score,
      trustStars: user.trust,
      disclaimer: 'Trust score is accumulated marketplace reliability, not a guarantee of behaviour. Separate from fraud risk.',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id/reviews', requireAuth, requireVerified, async (req, res) => {
  try {
    const reviews = await Review.find({ forUserId: req.params.id }).sort({ createdAt: -1 }).lean()
    res.json(reviews.map((r) => ({ ...r, id: r._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', requireAuth, requireVerified, async (_req, res) => {
  try {
    const users = await User.find().select('-passwordHash -otpHash -locationExact').lean()
    res.json(users.map((u) => ({ ...u, id: u._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
