import { Router } from 'express'
import Review from '../models/Review.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { recomputeTrustScore } from '../utils/trust.js'

const router = Router()

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const reviews = await Review.find({ forUserId: req.user._id }).sort({ createdAt: -1 }).lean()
    res.json(reviews.map((r) => ({ ...r, id: r._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const { forUserId, rating, text } = req.body || {}
    if (!forUserId || !rating || !text) return res.status(400).json({ error: 'forUserId, rating and text are required' })
    const review = await Review.create({
      from: req.user.name,
      fromUserId: req.user._id,
      avatar: req.user.avatar,
      rating: Number(rating),
      text,
      forUserId,
    })
    await recomputeTrustScore(forUserId)
    const obj = review.toObject()
    res.status(201).json({ ...obj, id: obj._id.toString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
