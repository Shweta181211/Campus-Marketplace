import { Router } from 'express'
import Notification from '../models/Notification.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const items = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(80).lean()
    res.json(items.map((n) => ({ ...n, id: n._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id/read', requireAuth, requireVerified, async (req, res) => {
  try {
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true },
      { new: true }
    ).lean()
    if (!item) return res.status(404).json({ error: 'Notification not found' })
    res.json({ ...item, id: item._id.toString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
