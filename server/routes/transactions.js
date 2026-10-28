import { Router } from 'express'
import Listing from '../models/Listing.js'
import Transaction from '../models/Transaction.js'
import Notification from '../models/Notification.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { loanStatusFromDates, remainingLabel } from '../utils/loans.js'
import { recomputeTrustScore } from '../utils/trust.js'

const router = Router()

function serializeTxn(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  return {
    ...obj,
    id: obj._id.toString(),
    remainingLabel: remainingLabel(obj.dueDate),
    meetingPoint:
      obj.meetingAgreedByBorrower && obj.meetingAgreedByLender ? obj.meetingPoint : undefined,
  }
}

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const uid = req.user._id
    const filter = {
      $or: [{ userId: uid }, { borrowerId: uid }, { lenderId: uid }, { buyerId: uid }, { sellerId: uid }],
    }
    if (req.query.status) filter.status = req.query.status
    const txns = await Transaction.find(filter).sort({ createdAt: -1 })
    res.json(txns.map(serializeTxn))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const { listingId, type, dueDate, dueDays, meetingPoint = '' } = req.body || {}
    if (!listingId) return res.status(400).json({ error: 'listingId is required' })
    const listing = await Listing.findById(listingId)
    if (!listing || listing.status !== 'active') {
      return res.status(404).json({ error: 'Listing not found' })
    }
    if (String(listing.seller?.userId) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot request your own listing' })
    }

    const isLoan = listing.type === 'lend' || listing.type === 'borrow' || type === 'borrow' || type === 'borrowed'
    if (isLoan) {
      const start = new Date()
      let due = dueDate ? new Date(dueDate) : null
      if (!due) {
        const days = Number(dueDays || listing.defaultDueDays || 7)
        due = new Date(start.getTime() + days * 86400000)
      }
      if (Number.isNaN(due.getTime()) || due <= start) {
        return res.status(400).json({ error: 'Due date invalid' })
      }
      const txn = await Transaction.create({
        item: listing.title,
        with: listing.seller?.name || 'Campus seller',
        amount: listing.price,
        type: 'borrowed',
        date: new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        listingId: listing._id,
        userId: req.user._id,
        borrowerId: req.user._id,
        lenderId: listing.seller?.userId,
        startDate: start,
        dueDate: due,
        status: 'REQUESTED',
        meetingPoint,
        isSeed: false,
      })
      if (listing.seller?.userId) {
        await Notification.create({
          userId: listing.seller.userId,
          title: 'Borrow request',
          body: `${req.user.name} requested to borrow "${listing.title}" until ${due.toDateString()}.`,
          type: 'loan',
          relatedId: String(txn._id),
        })
      }
      return res.status(201).json(serializeTxn(txn))
    }

    const txn = await Transaction.create({
      item: listing.title,
      with: listing.seller?.name || 'Campus seller',
      amount: listing.price,
      type: 'bought',
      date: new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      listingId: listing._id,
      userId: req.user._id,
      buyerId: req.user._id,
      sellerId: listing.seller?.userId,
      status: 'PAYMENT_PENDING',
      isSeed: false,
    })
    res.status(201).json(serializeTxn(txn))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/approve', requireAuth, requireVerified, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id)
    if (!txn) return res.status(404).json({ error: 'Transaction not found' })
    if (String(txn.lenderId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    if (txn.status !== 'REQUESTED') return res.status(400).json({ error: 'Transaction is not awaiting approval' })
    txn.status = 'ACTIVE'
    txn.startDate = new Date()
    const next = loanStatusFromDates(txn)
    txn.status = next.status
    txn.overdueStatus = next.overdueStatus
    await txn.save()
    if (txn.borrowerId) {
      await Notification.create({
        userId: txn.borrowerId,
        title: 'Borrow request approved',
        body: `${req.user.name} approved "${txn.item}". ${remainingLabel(txn.dueDate)}`,
        type: 'loan',
        relatedId: String(txn._id),
      })
    }
    res.json(serializeTxn(txn))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/reject', requireAuth, requireVerified, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id)
    if (!txn) return res.status(404).json({ error: 'Transaction not found' })
    if (String(txn.lenderId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    txn.status = 'REJECTED'
    await txn.save()
    res.json(serializeTxn(txn))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id/due-date', requireAuth, requireVerified, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id)
    if (!txn) return res.status(404).json({ error: 'Transaction not found' })
    if (String(txn.lenderId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    const due = new Date(req.body.dueDate)
    if (Number.isNaN(due.getTime())) return res.status(400).json({ error: 'Due date invalid' })
    txn.dueDate = due
    const next = loanStatusFromDates(txn)
    txn.status = next.status
    txn.overdueStatus = next.overdueStatus
    await txn.save()
    res.json(serializeTxn(txn))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id/return', requireAuth, requireVerified, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id)
    if (!txn) return res.status(404).json({ error: 'Transaction not found' })
    const isBorrower = String(txn.borrowerId) === String(req.user._id)
    const isLender = String(txn.lenderId) === String(req.user._id)
    if (!isBorrower && !isLender) return res.status(403).json({ error: 'Insufficient permissions' })

    if (['COMPLETED', 'RETURNED'].includes(txn.status) && isBorrower) {
      return res.status(400).json({ error: 'Transaction already returned' })
    }

    if (isBorrower && txn.status !== 'RETURNED') {
      txn.status = 'RETURN_REQUESTED'
      txn.returnedAt = new Date()
      await txn.save()
      if (txn.lenderId) {
        await Notification.create({
          userId: txn.lenderId,
          title: 'Return requested',
          body: `${req.user.name} marked "${txn.item}" as returned. Confirm to complete.`,
          type: 'loan',
          relatedId: String(txn._id),
        })
      }
      return res.json(serializeTxn(txn))
    }

    if (isLender) {
      if (!['RETURN_REQUESTED', 'RETURNED', 'ACTIVE', 'DUE_SOON', 'OVERDUE'].includes(txn.status)) {
        return res.status(400).json({ error: 'Cannot confirm return yet' })
      }
      txn.status = 'COMPLETED'
      txn.returnedAt = txn.returnedAt || new Date()
      txn.completedAt = new Date()
      txn.overdueStatus = txn.overdueStatus && txn.dueDate && txn.returnedAt > txn.dueDate
      await txn.save()
      if (txn.borrowerId) await recomputeTrustScore(txn.borrowerId)
      if (txn.lenderId) await recomputeTrustScore(txn.lenderId)
      return res.json(serializeTxn(txn))
    }

    res.status(400).json({ error: 'Unable to update return status' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/extend', requireAuth, requireVerified, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id)
    if (!txn) return res.status(404).json({ error: 'Transaction not found' })
    const days = Number(req.body.days || req.body.requestedDays || 3)
    if (!Number.isFinite(days) || days < 1 || days > 60) {
      return res.status(400).json({ error: 'Extension days invalid' })
    }

    const isBorrower = String(txn.borrowerId) === String(req.user._id)
    const isLender = String(txn.lenderId) === String(req.user._id)

    if (isBorrower) {
      txn.extensionHistory.push({
        requestedDays: days,
        requestedBy: req.user._id,
        status: 'pending',
      })
      await txn.save()
      if (txn.lenderId) {
        await Notification.create({
          userId: txn.lenderId,
          title: 'Extension requested',
          body: `${req.user.name} asked for ${days} more days on "${txn.item}".`,
          type: 'loan',
          relatedId: String(txn._id),
        })
      }
      return res.json(serializeTxn(txn))
    }

    if (isLender) {
      const pending = [...txn.extensionHistory].reverse().find((e) => e.status === 'pending')
      if (!pending) return res.status(400).json({ error: 'No pending extension request' })
      const approve = req.body.approve !== false
      pending.status = approve ? 'approved' : 'rejected'
      pending.resolvedAt = new Date()
      if (approve) {
        txn.dueDate = new Date(new Date(txn.dueDate).getTime() + pending.requestedDays * 86400000)
        txn.extensionCount += 1
        const next = loanStatusFromDates(txn)
        txn.status = next.status
        txn.overdueStatus = next.overdueStatus
      }
      await txn.save()
      return res.json(serializeTxn(txn))
    }

    return res.status(403).json({ error: 'Insufficient permissions' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id/meeting', requireAuth, requireVerified, async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.id)
    if (!txn) return res.status(404).json({ error: 'Transaction not found' })
    const isBorrower = String(txn.borrowerId) === String(req.user._id)
    const isLender = String(txn.lenderId) === String(req.user._id)
    if (!isBorrower && !isLender) return res.status(403).json({ error: 'Insufficient permissions' })
    if (req.body.meetingPoint) txn.meetingPoint = String(req.body.meetingPoint).slice(0, 200)
    if (isBorrower) txn.meetingAgreedByBorrower = true
    if (isLender) txn.meetingAgreedByLender = true
    await txn.save()
    res.json(serializeTxn(txn))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
