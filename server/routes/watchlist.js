import { Router } from 'express'
import Watchlist from '../models/Watchlist.js'
import Listing from '../models/Listing.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { serializeListing } from './listings.js'

const router = Router()

function alertPrefs(body = {}) {
  const value = {}
  if (body.alertEnabled !== undefined) value.alertEnabled = Boolean(body.alertEnabled)
  if (body.thresholdType !== undefined) {
    if (!['any', 'percent', 'amount'].includes(body.thresholdType)) return { error: 'thresholdType must be any, percent or amount' }
    value.thresholdType = body.thresholdType
  }
  if (body.thresholdValue !== undefined) {
    const v = Number(body.thresholdValue)
    if (!Number.isFinite(v) || v < 0) return { error: 'thresholdValue must be a positive number' }
    if ((body.thresholdType || value.thresholdType) === 'percent' && v > 90) return { error: 'percent threshold must be at most 90' }
    value.thresholdValue = v
  }
  return { value }
}

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const rows = await Watchlist.find({ userId: req.user._id }).populate('listingId').lean()
    const items = rows
      .filter((r) => r.listingId && r.listingId.status !== 'removed')
      .map((r) => ({
        id: r._id.toString(),
        listingId: r.listingId._id.toString(),
        listing: serializeListing(r.listingId),
        lastObservedPrice: r.lastObservedPrice,
        alertEnabled: r.alertEnabled !== false,
        thresholdType: r.thresholdType || 'any',
        thresholdValue: r.thresholdValue || 0,
      }))
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const listingId = req.body.listingId
    if (!listingId) return res.status(400).json({ error: 'listingId is required' })
    const listing = await Listing.findById(listingId)
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    const prefs = alertPrefs(req.body)
    if (prefs.error) return res.status(400).json({ error: prefs.error })
    const row = await Watchlist.findOneAndUpdate(
      { userId: req.user._id, listingId },
      { $set: { ...prefs.value }, $setOnInsert: { userId: req.user._id, listingId, lastObservedPrice: Number(listing.price) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    res.status(201).json({ ok: true, listingId, id: row._id.toString(), lastObservedPrice: row.lastObservedPrice })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Change alert preferences for a watched listing: { alertEnabled, thresholdType: any|percent|amount, thresholdValue }
router.put('/:listingId', requireAuth, requireVerified, async (req, res) => {
  try {
    const prefs = alertPrefs(req.body)
    if (prefs.error) return res.status(400).json({ error: prefs.error })
    const row = await Watchlist.findOneAndUpdate(
      { userId: req.user._id, listingId: req.params.listingId },
      { $set: prefs.value },
      { new: true }
    )
    if (!row) return res.status(404).json({ error: 'You are not watching this listing' })
    res.json({ ok: true, alertEnabled: row.alertEnabled, thresholdType: row.thresholdType, thresholdValue: row.thresholdValue })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:listingId', requireAuth, requireVerified, async (req, res) => {
  try {
    await Watchlist.deleteOne({ userId: req.user._id, listingId: req.params.listingId })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
