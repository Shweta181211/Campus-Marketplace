import { Router } from 'express'
import mongoose from 'mongoose'
import Moderation from '../models/Moderation.js'
import Listing from '../models/Listing.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import FraudReport from '../models/FraudReport.js'
import Transaction from '../models/Transaction.js'
import Payment from '../models/Payment.js'
import AuditLog from '../models/AuditLog.js'
import Settings from '../models/Settings.js'
import { requireAuth, requireAdmin, requireVerified, publicUser } from '../middleware/auth.js'
import { recomputeTrustScore } from '../utils/trust.js'
import { audit } from '../utils/audit.js'
import { getSettings, clearSettingsCache, DEFAULT_CATEGORIES } from '../utils/settings.js'
import { fraudModelInfo } from '../utils/mlClient.js'
import { linkedAccountCount } from '../utils/device.js'

const router = Router()
const admin = [requireAuth, requireVerified, requireAdmin]
const isId = (v) => mongoose.isValidObjectId(v)

function listingSummary(l) {
  if (!l) return null
  return {
    id: String(l._id),
    title: l.title,
    price: l.price,
    recommendedPrice: l.recommendedPrice,
    fairMin: l.fairMin,
    fairMax: l.fairMax,
    category: l.category,
    description: l.description,
    images: l.images || [],
    fraudRiskScore: l.fraudRiskScore,
    fraudRiskLevel: l.fraudRiskLevel,
    fraudSignals: l.fraudSignals,
    fraudReasons: l.fraudReasons || [],
    fraudSource: l.fraudSource,
    status: l.status,
    heldReason: l.heldReason,
    reportCount: l.reportCount || 0,
    seller: l.seller,
  }
}

// ---------------------------------------------------------------- fraud alerts / listing review
router.get('/fraud-alerts', ...admin, async (req, res) => {
  try {
    const status = req.query.status === 'all' ? {} : { status: 'pending' }
    const queue = await Moderation.find(status).sort({ createdAt: -1 }).limit(200).lean()
    const listingIds = queue.map((q) => q.listingId).filter(Boolean)
    const listings = await Listing.find({ _id: { $in: listingIds } }).lean()
    const byId = Object.fromEntries(listings.map((l) => [String(l._id), l]))
    res.json(queue.map((m) => ({ ...m, id: m._id.toString(), listingDoc: listingSummary(byId[String(m.listingId)]) })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/listings/:id/review', ...admin, async (req, res) => {
  try {
    const { decision, status, note = '' } = req.body || {}
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid listing id' })
    const listing = await Listing.findById(req.params.id)
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    const action = (decision || status || '').toLowerCase()
    if (!['approve', 'approved', 'reject', 'rejected', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'decision must be approve or reject' })
    }
    const approved = action.startsWith('approve')
    const before = { status: listing.status, fraudDecision: listing.fraudDecision }
    listing.fraudReviewed = true
    listing.fraudReviewedBy = req.user._id
    listing.fraudReviewedAt = new Date()
    listing.fraudDecision = approved ? 'approved' : 'rejected'
    listing.status = approved ? 'active' : 'removed'
    listing.heldReason = null
    await listing.save()

    await Moderation.updateMany(
      { listingId: listing._id, status: 'pending' },
      { status: approved ? 'approved' : 'rejected', reviewedBy: req.user._id, reviewedAt: new Date(), adminNote: String(note).slice(0, 500) }
    )
    // reports about this listing are resolved together with it
    await FraudReport.updateMany(
      { listingId: listing._id, status: 'open' },
      { status: approved ? 'dismissed' : 'confirmed', reviewedBy: req.user._id, reviewedAt: new Date(), adminNote: 'Resolved with listing review' }
    )
    await audit(approved ? 'listing_approved' : 'listing_rejected', {
      actor: req.user,
      targetUserId: listing.seller?.userId,
      targetListingId: listing._id,
      before,
      after: { status: listing.status, fraudDecision: listing.fraudDecision },
      reason: note || `fraud risk ${listing.fraudRiskScore} (${listing.fraudRiskLevel})`,
    })

    if (listing.seller?.userId) {
      await recomputeTrustScore(listing.seller.userId, {
        reason: approved ? 'admin approved flagged listing' : 'admin rejected flagged listing',
        actor: req.user,
      })
      await Notification.create({
        userId: listing.seller.userId,
        title: approved ? 'Listing approved' : 'Listing removed after review',
        body: approved
          ? `"${listing.title}" is now live after admin review.`
          : `"${listing.title}" was removed after admin review.${note ? ` Note: ${note}` : ''}`,
        type: 'fraud',
        relatedId: String(listing._id),
      })
    }
    res.json({ ok: true, id: listing._id.toString(), status: listing.status, fraudDecision: listing.fraudDecision })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// legacy moderation queue (also mounted at /api/moderation)
router.get('/', ...admin, async (_req, res) => {
  try {
    const queue = await Moderation.find({ status: 'pending' }).sort({ createdAt: -1 }).lean()
    res.json(queue.map((m) => ({ ...m, id: m._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------- reports
router.get('/reports', ...admin, async (req, res) => {
  try {
    const filter = req.query.status && req.query.status !== 'all' ? { status: req.query.status } : {}
    const rows = await FraudReport.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('reporterId', 'name email avatar avatarConfig')
      .populate('accusedUserId', 'name email avatar avatarConfig trustScore suspended confirmedReports')
      .populate('listingId', 'title price status fraudRiskScore fraudRiskLevel')
      .lean()
    res.json(
      rows.map((r) => ({
        ...r,
        id: r._id.toString(),
        reporter: r.reporterId,
        accused: r.accusedUserId,
        listing: r.listingId,
      }))
    )
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/reports/:id', ...admin, async (req, res) => {
  try {
    const { status, note = '', removeListing = false } = req.body || {}
    if (!['confirmed', 'dismissed'].includes(status)) return res.status(400).json({ error: 'status must be confirmed or dismissed' })
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid report id' })
    const report = await FraudReport.findById(req.params.id)
    if (!report) return res.status(404).json({ error: 'Report not found' })
    if (report.status !== 'open') return res.status(409).json({ error: `Report is already ${report.status}` })
    report.status = status
    report.adminNote = String(note).slice(0, 500)
    report.reviewedBy = req.user._id
    report.reviewedAt = new Date()
    await report.save()

    if (status === 'confirmed' && report.accusedUserId) {
      await User.updateOne({ _id: report.accusedUserId }, { $inc: { confirmedReports: 1 } })
      if (removeListing && report.listingId) {
        await Listing.updateOne({ _id: report.listingId }, { status: 'removed', fraudDecision: 'rejected', heldReason: null })
      }
      await Notification.create({
        userId: report.accusedUserId,
        title: 'A report against you was upheld',
        body: `An admin confirmed a ${report.category.replace('_', ' ')} report. Repeated confirmed reports can lead to suspension.`,
        type: 'report',
        relatedId: String(report._id),
      })
    } else if (status === 'dismissed' && report.listingId) {
      // listing was auto-held by reports and nothing else is pending -> put it back
      const l = await Listing.findById(report.listingId)
      const stillOpen = await FraudReport.countDocuments({ listingId: report.listingId, status: 'open' })
      if (l && l.status === 'held' && l.heldReason === 'reports' && stillOpen < 3) {
        l.status = 'active'
        l.heldReason = null
        l.reportCount = stillOpen
        await l.save()
      }
    }
    if (report.reporterId) {
      await Notification.create({
        userId: report.reporterId,
        title: 'Your report was reviewed',
        body: status === 'confirmed' ? 'Thank you — the admin team took action.' : 'An admin reviewed your report and did not find a violation.',
        type: 'report',
        relatedId: String(report._id),
      })
    }
    await audit(`report_${status}`, {
      actor: req.user,
      targetUserId: report.accusedUserId,
      targetListingId: report.listingId,
      after: { status, category: report.category },
      reason: note || report.reason,
    })
    if (report.accusedUserId) {
      await recomputeTrustScore(report.accusedUserId, { reason: `report ${status} by admin`, actor: req.user })
    }
    res.json({ ok: true, id: report._id.toString(), status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------- users / suspension
router.get('/users', ...admin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60)
    const filter = {}
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      filter.$or = [{ name: rx }, { email: rx }]
    }
    if (req.query.suspended === 'true') filter.suspended = true
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(200)
    const out = []
    for (const u of users) {
      const [openReports, listings] = await Promise.all([
        FraudReport.countDocuments({ accusedUserId: u._id, status: 'open' }),
        Listing.countDocuments({ 'seller.userId': u._id, status: { $ne: 'removed' } }),
      ])
      out.push({ ...publicUser(u), openReports, activeListings: listings, linkedAccounts: await linkedAccountCount(u._id) })
    }
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/users/:id/suspend', ...admin, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid user id' })
    const { suspended = true, reason = '' } = req.body || {}
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.role === 'admin') return res.status(400).json({ error: 'Admins cannot be suspended here' })
    if (suspended && String(reason).trim().length < 3) return res.status(400).json({ error: 'A reason is required to suspend a student' })
    const before = { suspended: user.suspended }
    user.suspended = Boolean(suspended)
    user.suspendedReason = suspended ? String(reason).slice(0, 300) : ''
    user.suspendedAt = suspended ? new Date() : null
    await user.save()

    let affected
    if (suspended) {
      affected = await Listing.updateMany(
        { 'seller.userId': user._id, status: 'active' },
        { status: 'held', heldReason: 'suspension' }
      )
    } else {
      affected = await Listing.updateMany(
        { 'seller.userId': user._id, status: 'held', heldReason: 'suspension' },
        { status: 'active', heldReason: null }
      )
    }
    await audit(suspended ? 'user_suspended' : 'user_unsuspended', {
      actor: req.user,
      targetUserId: user._id,
      before,
      after: { suspended: user.suspended, listingsChanged: affected.modifiedCount },
      reason,
    })
    await Notification.create({
      userId: user._id,
      title: suspended ? 'Account suspended' : 'Account restored',
      body: suspended ? `Your account was suspended: ${reason}` : 'Your account is active again and your listings are visible.',
      type: 'system',
    })
    res.json({ ok: true, id: user._id.toString(), suspended: user.suspended, listingsChanged: affected.modifiedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------- analytics
router.get('/analytics', ...admin, async (_req, res) => {
  try {
    const since7 = new Date(Date.now() - 7 * 86400000)
    const [
      users,
      verified,
      suspended,
      listingsByStatus,
      listingsByCategory,
      fraudLevels,
      txByStatus,
      overdue,
      openReports,
      confirmedReports,
      pendingReview,
      payments,
      newListings,
      trustAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ verified: true }),
      User.countDocuments({ suspended: true }),
      Listing.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Listing.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
      Listing.aggregate([{ $group: { _id: '$fraudRiskLevel', n: { $sum: 1 } } }]),
      Transaction.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Transaction.find({ overdueStatus: true }).sort({ dueDate: 1 }).limit(50).lean(),
      FraudReport.countDocuments({ status: 'open' }),
      FraudReport.countDocuments({ status: 'confirmed' }),
      Moderation.countDocuments({ status: 'pending' }),
      Payment.find({ status: 'paid' }).select('amount').lean(),
      Listing.find({ createdAt: { $gte: since7 } }).select('createdAt').lean(),
      User.find().select('trustScore').lean(),
    ])
    const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id || 'unknown', r.n]))
    const perDay = {}
    for (let i = 6; i >= 0; i -= 1) perDay[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 0
    for (const l of newListings) {
      const d = new Date(l.createdAt).toISOString().slice(0, 10)
      if (d in perDay) perDay[d] += 1
    }
    res.json({
      users: { total: users, verified, suspended, avgTrustScore: trustAgg.length ? Math.round(trustAgg.reduce((a, u) => a + Number(u.trustScore || 0), 0) / trustAgg.length) : 0 },
      listings: { byStatus: toMap(listingsByStatus), byCategory: toMap(listingsByCategory), byFraudLevel: toMap(fraudLevels), newPerDay: perDay },
      transactions: { byStatus: toMap(txByStatus), overdueCount: overdue.length },
      overdueLoans: overdue.map((t) => ({
        id: String(t._id),
        item: t.item,
        dueDate: t.dueDate,
        borrowerId: t.borrowerId,
        lenderId: t.lenderId,
        with: t.with,
        status: t.status,
      })),
      moderation: { pendingReview, openReports, confirmedReports },
      payments: { paidCount: payments.length, paidTotal: payments.reduce((a, p) => a + Number(p.amount || 0), 0) },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------- institution settings
router.get('/settings', ...admin, async (_req, res) => {
  try {
    const s = await getSettings()
    res.json({ bannedWords: s.bannedWords || [], categories: s.categories?.length ? s.categories : DEFAULT_CATEGORIES })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/settings', ...admin, async (req, res) => {
  try {
    const { bannedWords, categories } = req.body || {}
    const update = { updatedBy: req.user._id }
    if (bannedWords !== undefined) {
      if (!Array.isArray(bannedWords)) return res.status(400).json({ error: 'bannedWords must be a list' })
      update.bannedWords = [...new Set(bannedWords.map((w) => String(w).trim().toLowerCase()).filter((w) => w.length >= 2 && w.length <= 40))].slice(0, 300)
    }
    if (categories !== undefined) {
      if (!Array.isArray(categories) || !categories.length) return res.status(400).json({ error: 'categories must be a non-empty list' })
      const seen = new Set()
      const clean = []
      for (const c of categories) {
        const id = String(c.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24)
        if (!id || seen.has(id)) continue
        seen.add(id)
        clean.push({
          id,
          label: String(c.label || id).slice(0, 40),
          tape: ['yellow', 'sky', 'coral', 'moss'].includes(c.tape) ? c.tape : 'moss',
          enabled: c.enabled !== false,
        })
      }
      if (!clean.some((c) => c.enabled)) return res.status(400).json({ error: 'At least one category must stay enabled' })
      update.categories = clean
    }
    const before = await getSettings()
    await Settings.updateOne({ key: 'marketplace' }, { $set: update }, { upsert: true })
    clearSettingsCache()
    const after = await getSettings()
    await audit('settings_changed', {
      actor: req.user,
      before: { bannedWords: before.bannedWords?.length, categories: before.categories?.map((c) => `${c.id}:${c.enabled}`) },
      after: { bannedWords: after.bannedWords?.length, categories: after.categories?.map((c) => `${c.id}:${c.enabled}`) },
    })
    res.json({ bannedWords: after.bannedWords, categories: after.categories })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------- audit trail + model info
router.get('/audit', ...admin, async (req, res) => {
  try {
    const filter = {}
    if (req.query.userId && isId(req.query.userId)) filter.targetUserId = req.query.userId
    if (req.query.action) filter.action = String(req.query.action)
    const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).lean()
    res.json(rows.map((r) => ({ ...r, id: r._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/fraud-model', ...admin, async (_req, res) => {
  try {
    res.json(await fraudModelInfo())
  } catch (err) {
    res.json({ loaded: false, error: `ML service unavailable (${err.message}). Listings are screened by the rule-based fallback.` })
  }
})

router.patch('/:id', ...admin, async (req, res) => {
  try {
    const { status } = req.body
    if (!['pending', 'reviewed', 'dismissed', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' })
    const item = await Moderation.findByIdAndUpdate(req.params.id, { status, reviewedBy: req.user._id, reviewedAt: new Date() }, { new: true }).lean()
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json({ ...item, id: item._id.toString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
