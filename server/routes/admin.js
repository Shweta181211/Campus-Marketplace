import { Router } from 'express'
import Moderation from '../models/Moderation.js'
import Listing from '../models/Listing.js'
import Notification from '../models/Notification.js'
import { requireAuth, requireAdmin, requireVerified } from '../middleware/auth.js'

const router = Router()

router.get('/fraud-alerts', requireAuth, requireVerified, requireAdmin, async (_req, res) => {
  try {
    const queue = await Moderation.find({ status: { $in: ['pending'] } })
      .sort({ createdAt: -1 })
      .lean()
    const listingIds = queue.map((q) => q.listingId).filter(Boolean)
    const listings = await Listing.find({ _id: { $in: listingIds } }).lean()
    const byId = Object.fromEntries(listings.map((l) => [String(l._id), l]))
    res.json(
      queue.map((m) => ({
        ...m,
        id: m._id.toString(),
        listingDoc: byId[String(m.listingId)]
          ? {
              id: String(m.listingId),
              title: byId[String(m.listingId)].title,
              price: byId[String(m.listingId)].price,
              fraudRiskScore: byId[String(m.listingId)].fraudRiskScore,
              fraudRiskLevel: byId[String(m.listingId)].fraudRiskLevel,
              fraudSignals: byId[String(m.listingId)].fraudSignals,
              status: byId[String(m.listingId)].status,
            }
          : null,
      }))
    )
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/listings/:id/review', requireAuth, requireVerified, requireAdmin, async (req, res) => {
  try {
    const { decision, status } = req.body || {}
    const listing = await Listing.findById(req.params.id)
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    const action = (decision || status || '').toLowerCase()
    if (!['approve', 'approved', 'reject', 'rejected', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'decision must be approve or reject' })
    }
    const approved = action.startsWith('approve')
    listing.fraudReviewed = true
    listing.fraudReviewedBy = req.user._id
    listing.fraudReviewedAt = new Date()
    listing.fraudDecision = approved ? 'approved' : 'rejected'
    listing.status = approved ? 'active' : 'removed'
    await listing.save()

    await Moderation.updateMany(
      { listingId: listing._id, status: 'pending' },
      { status: approved ? 'approved' : 'rejected', reviewedBy: req.user._id, reviewedAt: new Date() }
    )

    if (listing.seller?.userId) {
      await Notification.create({
        userId: listing.seller.userId,
        title: approved ? 'Listing approved' : 'Listing removed after review',
        body: approved
          ? `"${listing.title}" is now live after admin review.`
          : `"${listing.title}" was removed after admin review.`,
        type: 'fraud',
        relatedId: String(listing._id),
      })
    }

    res.json({
      ok: true,
      id: listing._id.toString(),
      status: listing.status,
      fraudDecision: listing.fraudDecision,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', requireAuth, requireVerified, requireAdmin, async (_req, res) => {
  try {
    const queue = await Moderation.find({ status: 'pending' }).sort({ createdAt: -1 }).lean()
    res.json(queue.map((m) => ({ ...m, id: m._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id', requireAuth, requireVerified, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body
    if (!['pending', 'reviewed', 'dismissed', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const item = await Moderation.findByIdAndUpdate(req.params.id, { status, reviewedBy: req.user._id, reviewedAt: new Date() }, { new: true }).lean()
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json({ ...item, id: item._id.toString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
