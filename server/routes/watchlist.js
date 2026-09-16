import { Router } from 'express'
import Watchlist from '../models/Watchlist.js'
import Listing from '../models/Listing.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { serializeListing } from './listings.js'

const router = Router()

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const rows = await Watchlist.find({ userId: req.user._id }).populate('listingId').lean()
    const items = rows
      .filter((r) => r.listingId && r.listingId.status !== 'removed')
      .map((r) => ({
        id: r._id.toString(),
        listingId: r.listingId._id.toString(),
        listing: serializeListing(r.listingId),
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
    const row = await Watchlist.findOneAndUpdate(
      { userId: req.user._id, listingId },
      { userId: req.user._id, listingId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    res.status(201).json({ ok: true, listingId, id: row._id.toString() })
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
