import { Router } from 'express'
import mongoose from 'mongoose'
import FraudReport from '../models/FraudReport.js'
import Listing from '../models/Listing.js'
import Message from '../models/Message.js'
import User from '../models/User.js'
import Moderation from '../models/Moderation.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { recomputeTrustScore } from '../utils/trust.js'

const router = Router()
const CATEGORIES = ['scam', 'fake_listing', 'prohibited_item', 'harassment', 'spam', 'no_show', 'other']
const AUTO_HOLD_REPORTS = 3 // distinct open reports on one listing -> hidden until an admin looks at it

const isId = (v) => mongoose.isValidObjectId(v)

/**
 * Students report a listing, a user, or a chat message (chat abuse reporting, PDF section 14).
 * Reports are "unverified complaints" until an admin confirms them, so they only nudge the trust score; a
 * confirmed report counts much more (see utils/trust.js).
 */
router.post('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const { targetType = 'listing', listingId, userId, messageId, reason, category = 'other', details = '' } = req.body || {}
    if (!['listing', 'user', 'message'].includes(targetType)) return res.status(400).json({ error: 'targetType must be listing, user or message' })
    if (!reason || String(reason).trim().length < 3) return res.status(400).json({ error: 'Please describe the problem' })
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Unknown report category' })

    const doc = {
      targetType,
      reporterId: req.user._id,
      reason: String(reason).slice(0, 300),
      details: String(details).slice(0, 1000),
      category,
      severity: ['scam', 'harassment', 'prohibited_item'].includes(category) ? 'high' : 'medium',
    }
    let listing = null
    if (targetType === 'listing') {
      if (!isId(listingId)) return res.status(400).json({ error: 'listingId is required' })
      listing = await Listing.findById(listingId)
      if (!listing) return res.status(404).json({ error: 'Listing not found' })
      doc.listingId = listing._id
      doc.accusedUserId = listing.seller?.userId
      doc.riskScore = listing.fraudRiskScore || 0
    } else if (targetType === 'message') {
      if (!isId(messageId)) return res.status(400).json({ error: 'messageId is required' })
      const msg = await Message.findById(messageId)
      if (!msg) return res.status(404).json({ error: 'Message not found' })
      // you can only report messages that were sent to you
      if (String(msg.toUserId) !== String(req.user._id)) return res.status(403).json({ error: 'You can only report messages you received' })
      doc.messageId = msg._id
      doc.conversationId = msg.conversationId
      doc.accusedUserId = msg.fromUserId
      doc.listingId = msg.listingId
      doc.details = doc.details || `Message: "${String(msg.body || msg.preview).slice(0, 300)}"`
    } else {
      if (!isId(userId)) return res.status(400).json({ error: 'userId is required' })
      const u = await User.findById(userId)
      if (!u) return res.status(404).json({ error: 'User not found' })
      doc.accusedUserId = u._id
    }
    if (!doc.accusedUserId) return res.status(400).json({ error: 'Could not find who to report' })
    if (String(doc.accusedUserId) === String(req.user._id)) return res.status(400).json({ error: 'You cannot report yourself' })

    const dupe = await FraudReport.findOne({
      reporterId: req.user._id,
      accusedUserId: doc.accusedUserId,
      status: 'open',
      ...(doc.listingId ? { listingId: doc.listingId } : {}),
      ...(doc.messageId ? { messageId: doc.messageId } : {}),
    })
    if (dupe) return res.status(409).json({ error: 'You already reported this. An admin will review it.' })

    const report = await FraudReport.create(doc)
    await recomputeTrustScore(doc.accusedUserId, { reason: 'new open report (unverified)' })

    let autoHeld = false
    if (listing) {
      const reporters = await FraudReport.distinct('reporterId', { listingId: listing._id, status: 'open' })
      listing.reportCount = reporters.length
      if (reporters.length >= AUTO_HOLD_REPORTS && listing.status === 'active') {
        listing.status = 'held'
        listing.heldReason = 'reports'
        listing.fraudDecision = 'pending'
        autoHeld = true
        await Moderation.create({
          listing: listing.title,
          risk: 'High',
          reason: `${reporters.length} students reported this listing`,
          seller: listing.seller?.name || 'Unknown',
          sellerUserId: listing.seller?.userId,
          listingId: listing._id,
          fraudRiskScore: listing.fraudRiskScore,
          signals: ['multiple_student_reports'],
          source: 'reports',
          status: 'pending',
        })
      }
      await listing.save()
    }
    res.status(201).json({ ok: true, id: report._id.toString(), autoHeld, message: 'Thanks — an admin will review this report.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/mine', requireAuth, requireVerified, async (req, res) => {
  try {
    const rows = await FraudReport.find({ reporterId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean()
    res.json(rows.map((r) => ({ ...r, id: r._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
