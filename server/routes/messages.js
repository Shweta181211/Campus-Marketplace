import { Router } from 'express'
import Message from '../models/Message.js'
import Listing from '../models/Listing.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'

const router = Router()

function conversationIdFor(a, b, listingId) {
  const [x, y] = [String(a), String(b)].sort()
  return `${x}:${y}:${listingId || 'general'}`
}

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  return { ...obj, id: obj._id.toString() }
}

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const uid = String(req.user._id)
    const messages = await Message.find({
      $or: [{ fromUserId: req.user._id }, { toUserId: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .lean()

    const threads = new Map()
    for (const m of messages) {
      const cid = m.conversationId
      if (!threads.has(cid)) {
        threads.set(cid, {
          id: cid,
          conversationId: cid,
          name: String(m.fromUserId) === uid ? 'You → ' + (m.name || 'Student') : m.name,
          avatar: m.avatar,
          preview: m.preview || m.body,
          time: m.time,
          unread: m.unread && String(m.toUserId) === uid,
          item: m.item,
          listingId: m.listingId,
          fromUserId: m.fromUserId,
          toUserId: m.toUserId,
        })
      }
    }
    res.json([...threads.values()])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:conversationId', requireAuth, requireVerified, async (req, res) => {
  try {
    const messages = await Message.find({ conversationId: req.params.conversationId }).sort({ createdAt: 1 }).lean()
    const allowed = messages.some(
      (m) => String(m.fromUserId) === String(req.user._id) || String(m.toUserId) === String(req.user._id)
    )
    if (messages.length && !allowed) return res.status(403).json({ error: 'Insufficient permissions' })
    res.json(messages.map((m) => ({ ...m, id: m._id.toString() })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const { preview, body, item = '', listingId, toUserId, conversationId } = req.body || {}
    const text = body || preview
    if (!text) return res.status(400).json({ error: 'message body is required' })

    let peer = toUserId
    let listingTitle = item
    if (listingId) {
      const listing = await Listing.findById(listingId)
      if (listing) {
        listingTitle = listing.title
        peer = peer || listing.seller?.userId
        await Listing.findByIdAndUpdate(listingId, { $inc: { messageCount: 1 } })
      }
    }
    if (!peer) return res.status(400).json({ error: 'toUserId or listingId is required' })

    const cid = conversationId || conversationIdFor(req.user._id, peer, listingId)
    const message = await Message.create({
      conversationId: cid,
      name: req.user.name,
      avatar: req.user.avatar,
      preview: String(text).slice(0, 180),
      body: text,
      item: listingTitle,
      listingId: listingId || undefined,
      fromUserId: req.user._id,
      toUserId: peer,
      time: 'just now',
      unread: true,
    })
    res.status(201).json(serialize(message))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
export { conversationIdFor }
