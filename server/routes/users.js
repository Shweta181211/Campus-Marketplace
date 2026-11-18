import { Router } from 'express'
import mongoose from 'mongoose'
import User from '../models/User.js'
import Review from '../models/Review.js'
import { requireAuth, requireVerified, publicUser } from '../middleware/auth.js'
import { recomputeTrustScore, trustInputs, computeTrust, trustBand, TRUST_WEIGHTS } from '../utils/trust.js'
import AuditLog from '../models/AuditLog.js'
import { findBannedWord } from '../utils/settings.js'

const AVATAR_OPTIONS = {
  face: ['round', 'oval', 'square'],
  skin: ['#f6d7b0', '#e8b98a', '#c68a5b', '#8d5a3b', '#5c3a24'],
  hair: ['short', 'long', 'curly', 'bun', 'buzz', 'none'],
  hairColor: ['#2b1d14', '#5a3825', '#a0522d', '#d4a017', '#9e9e9e', '#c2185b'],
  outfit: ['tshirt', 'hoodie', 'shirt', 'kurta'],
  outfitColor: ['#e76f51', '#2a9d8f', '#264653', '#e9c46a', '#8ab17d', '#6d597a'],
  accessory: ['none', 'glasses', 'cap', 'earrings', 'headphones'],
  bg: ['#fde68a', '#bae6fd', '#fecaca', '#bbf7d0', '#e9d5ff'],
}

function cleanAvatarConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return null
  const out = {}
  for (const [k, allowed] of Object.entries(AVATAR_OPTIONS)) {
    out[k] = allowed.includes(cfg[k]) ? cfg[k] : allowed[0]
  }
  return out
}

const router = Router()

router.get('/me', requireAuth, async (req, res) => {
  res.json(publicUser(req.user))
})

router.get('/avatar-options', requireAuth, (_req, res) => res.json(AVATAR_OPTIONS))

// Edit own profile: name, hostel, emoji avatar and the avatar-builder JSON (PDF 3.1)
router.put('/me', requireAuth, requireVerified, async (req, res) => {
  try {
    const { name, hostel, avatar, avatarConfig } = req.body || {}
    if (name !== undefined) {
      const n = String(name).trim()
      if (n.length < 2 || n.length > 60) return res.status(400).json({ error: 'Name must be 2-60 characters' })
      if (await findBannedWord(n)) return res.status(400).json({ error: 'Please choose a different display name' })
      req.user.name = n
      req.user.initials = n.split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
    }
    if (hostel !== undefined) req.user.hostel = String(hostel).slice(0, 60)
    if (avatar !== undefined) req.user.avatar = String(avatar).slice(0, 8)
    if (avatarConfig !== undefined) req.user.avatarConfig = cleanAvatarConfig(avatarConfig)
    await req.user.save()
    res.json(publicUser(req.user))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id/trust-score', requireAuth, requireVerified, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid user id' })
    const score = await recomputeTrustScore(req.params.id)
    const data = await trustInputs(req.params.id)
    if (!data) return res.status(404).json({ error: 'User not found' })
    const { user, inputs } = data
    const breakdown = computeTrust(inputs)
    const self = String(user._id) === String(req.user._id) || req.user.role === 'admin'
    const history = self
      ? await AuditLog.find({ targetUserId: user._id, action: 'trust_score_changed' }).sort({ createdAt: -1 }).limit(20).lean()
      : []
    res.json({
      userId: user._id.toString(),
      trustScore: score,
      trustStars: user.trust,
      ...trustBand(score),
      formula: 'T = 10 + 20·V + 25·R + 20·C + 15·O + 10·A − 40·F  (0-100)',
      weights: TRUST_WEIGHTS,
      components: breakdown.components,
      contributions: breakdown.contributions,
      inputs: {
        verified: Boolean(inputs.verified),
        reviews: inputs.reviewCount,
        averageRating: Math.round(inputs.avgRating * 10) / 10,
        completedTransactions: inputs.completed,
        onTimeReturns: inputs.onTimeLoans,
        overdueReturns: inputs.overdueLoans,
        accountAgeDays: Math.round(inputs.accountAgeDays),
        confirmedReports: inputs.confirmedReports,
        openReports: inputs.openReports,
      },
      history: history.map((h) => ({ at: h.createdAt, before: h.before?.trustScore, after: h.after?.trustScore, reason: h.reason })),
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
    const users = await User.find({ suspended: { $ne: true } })
      .select('name initials avatar avatarConfig hostel trust trustScore rating reviewCount verified joined')
      .lean()
    res.json(users.map((u) => ({ ...u, id: u._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
