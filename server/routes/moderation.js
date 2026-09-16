import { Router } from 'express'
import Moderation from '../models/Moderation.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const queue = await Moderation.find({ status: 'pending' }).sort({ createdAt: -1 }).lean()
    res.json(queue.map((m) => ({ ...m, id: m._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body
    if (!['pending', 'reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const item = await Moderation.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean()
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json({ ...item, id: item._id.toString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
