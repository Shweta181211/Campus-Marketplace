import { Router } from 'express'
import crypto from 'crypto'
import Payment from '../models/Payment.js'
import Transaction from '../models/Transaction.js'
import Listing from '../models/Listing.js'
import Notification from '../models/Notification.js'
import { requireAuth, requireVerified, requireAdmin } from '../middleware/auth.js'
import {
  createProviderOrder,
  paymentMode,
  verifyRazorpaySignature,
  verifyDevSignature,
  signDevPayment,
  getRazorpay,
} from '../utils/payments.js'
import { RESERVATION_MS, releaseListing, releaseExpiredReservations } from '../utils/reservations.js'

const router = Router()

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  const { signature, raw, ...safe } = obj // never send signatures / provider blobs to the browser
  void signature
  void raw
  return { ...safe, id: obj._id.toString(), paymentId: obj._id.toString() }
}

/**
 * Mark a payment as paid exactly once. Used by both the browser callback (/verify) and the Razorpay webhook,
 * so a student who closes the tab right after paying still gets the purchase recorded.
 */
export async function finalizePayment(payment, { providerPaymentId, signature }) {
  if (payment.status === 'paid' && payment.verified) return { payment, duplicate: true }

  // atomically claim the payment so a webhook + browser callback can't both finalize it
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['created', 'failed', 'cancelled'] } },
    {
      $set: {
        status: 'paid',
        verified: true,
        providerPaymentId: providerPaymentId || '',
        signature: signature || '',
        paidAt: new Date(),
      },
    },
    { new: true }
  )
  if (!claimed) {
    const fresh = await Payment.findById(payment._id)
    return { payment: fresh, duplicate: true }
  }

  const listing = claimed.listingId ? await Listing.findById(claimed.listingId) : null
  const stillOurs =
    listing &&
    (listing.status === 'active' ||
      (listing.status === 'reserved' && String(listing.reservedBy) === String(claimed.userId)))

  if (!stillOurs) {
    // Money was taken but the item is gone (reservation expired and someone else bought it). Refund it.
    await refundPayment(claimed, 'Item was no longer available when payment completed')
    await Notification.create({
      userId: claimed.userId,
      title: 'Payment refunded',
      body: `"${claimed.itemTitle || 'The item'}" was sold to someone else while you were paying. Your ₹${claimed.amount} is being refunded.`,
      type: 'payment',
      relatedId: String(claimed._id),
    })
    return { payment: await Payment.findById(claimed._id), refunded: true }
  }

  await Listing.updateOne({ _id: listing._id }, { $set: { status: 'sold', reservedBy: null, reservedUntil: null } })
  if (claimed.transactionId) {
    await Transaction.findByIdAndUpdate(claimed.transactionId, { status: 'PAID', completedAt: new Date() })
  }
  await Notification.create({
    userId: claimed.userId,
    title: 'Payment successful',
    body: `Payment of ₹${claimed.amount} for "${claimed.itemTitle || 'your item'}" was verified. Chat with the seller to arrange the hand-over.`,
    type: 'payment',
    relatedId: String(claimed._id),
  })
  if (claimed.sellerId) {
    await Notification.create({
      userId: claimed.sellerId,
      title: 'Your item was bought',
      body: `"${claimed.itemTitle || 'Your item'}" was paid for (₹${claimed.amount}). Arrange the campus hand-over with the buyer.`,
      type: 'payment',
      relatedId: String(claimed._id),
    })
  }
  return { payment: claimed, duplicate: false }
}

export async function refundPayment(payment, reason) {
  if (payment.provider === 'razorpay' && payment.providerPaymentId) {
    const client = getRazorpay()
    if (client) {
      try {
        await client.payments.refund(payment.providerPaymentId, { amount: Math.round(payment.amount * 100), notes: { reason } })
      } catch (err) {
        // keep the record so an admin can retry from the dashboard
        payment.refundReason = `REFUND FAILED: ${err.error?.description || err.message}`
        await payment.save()
        throw err
      }
    }
  }
  payment.status = 'refunded'
  payment.refundReason = reason
  payment.refundedAt = new Date()
  await payment.save()
  if (payment.transactionId) {
    await Transaction.findByIdAndUpdate(payment.transactionId, { status: 'CANCELLED' })
  }
  return payment
}

async function failPayment(payment, status) {
  if (payment.status === 'paid') return payment
  payment.status = status
  await payment.save()
  if (payment.transactionId) {
    await Transaction.updateOne({ _id: payment.transactionId, status: 'PAYMENT_PENDING' }, { $set: { status: 'CANCELLED' } })
  }
  await releaseListing(payment.listingId, { buyerId: payment.userId })
  return payment
}

router.get('/config', requireAuth, (_req, res) => {
  const mode = paymentMode()
  res.json({
    mode,
    provider: mode === 'razorpay' ? 'Razorpay' : 'Development simulator',
    keyId: mode === 'razorpay' ? process.env.RAZORPAY_KEY_ID : null,
    currency: 'INR',
    reservationMinutes: Math.round(RESERVATION_MS / 60000),
    realMoney: mode === 'razorpay' && String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_'),
  })
})

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const uid = req.user._id
    const rows = await Payment.find({ $or: [{ userId: uid }, { sellerId: uid }] }).sort({ createdAt: -1 }).limit(100)
    res.json(rows.map((p) => ({ ...serialize(p), role: String(p.userId) === String(uid) ? 'buyer' : 'seller' })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/create-order', requireAuth, requireVerified, async (req, res) => {
  try {
    await releaseExpiredReservations()
    const { listingId, transactionId } = req.body || {}
    let listing = null
    if (listingId) listing = await Listing.findById(listingId)
    if (!listing && transactionId) {
      const t = await Transaction.findById(transactionId)
      if (t?.listingId) listing = await Listing.findById(t.listingId)
    }
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    if (listing.type === 'lend' || listing.type === 'borrow') {
      return res.status(400).json({ error: 'Use borrow workflow for lend listings' })
    }
    if (String(listing.seller?.userId) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot buy your own listing' })
    }
    const mine = listing.status === 'reserved' && String(listing.reservedBy) === String(req.user._id)
    if (listing.status !== 'active' && !mine) {
      return res.status(409).json({
        error: listing.status === 'reserved' ? 'Another student is checking out this item right now. Try again in a few minutes.' : 'Listing is not available for purchase',
      })
    }

    // The price ALWAYS comes from the listing in the database. A client-sent amount is ignored.
    const rupees = Number(listing.price)
    if (!Number.isFinite(rupees) || rupees <= 0) return res.status(400).json({ error: 'Listing has no valid price' })

    // reserve first (atomic) so two buyers can't both get an order for the same item
    const reserved = await Listing.findOneAndUpdate(
      {
        _id: listing._id,
        $or: [{ status: 'active' }, { status: 'reserved', reservedBy: req.user._id }],
      },
      { $set: { status: 'reserved', reservedBy: req.user._id, reservedUntil: new Date(Date.now() + RESERVATION_MS) } },
      { new: true }
    )
    if (!reserved) return res.status(409).json({ error: 'Listing was just taken by another student' })

    // supersede this buyer's earlier unpaid orders for the item
    const stale = await Payment.find({ listingId: listing._id, userId: req.user._id, status: 'created' })
    await Payment.updateMany({ _id: { $in: stale.map((p) => p._id) } }, { $set: { status: 'cancelled' } })
    let txn = await Transaction.findOne({ listingId: listing._id, buyerId: req.user._id, status: 'PAYMENT_PENDING' })
    if (!txn) {
      txn = await Transaction.create({
        item: listing.title,
        with: listing.seller?.name || 'Campus seller',
        amount: rupees,
        type: 'bought',
        date: new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        listingId: listing._id,
        userId: req.user._id,
        buyerId: req.user._id,
        sellerId: listing.seller?.userId,
        status: 'PAYMENT_PENDING',
      })
    }

    let order
    try {
      order = await createProviderOrder({
        amount: rupees,
        receipt: `txn_${txn._id}`.slice(0, 40),
        notes: { listingId: String(listing._id), userId: String(req.user._id) },
      })
    } catch (err) {
      await releaseListing(listing._id, { buyerId: req.user._id })
      return res.status(502).json({ error: `Payment provider error: ${err.error?.description || err.message}` })
    }

    const payment = await Payment.create({
      orderId: order.orderId,
      transactionId: txn._id,
      listingId: listing._id,
      userId: req.user._id,
      sellerId: listing.seller?.userId || null,
      itemTitle: listing.title,
      amount: rupees,
      currency: 'INR',
      status: 'created',
      provider: order.provider,
    })
    txn.paymentId = payment._id
    txn.amount = rupees
    await txn.save()

    res.status(201).json({
      ...order,
      paymentId: payment._id.toString(),
      transactionId: txn._id.toString(),
      itemTitle: listing.title,
      amount: rupees,
      currency: 'INR',
      mode: paymentMode(),
      expiresAt: reserved.reservedUntil,
      prefill: { name: req.user.name, email: req.user.email },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/verify', requireAuth, requireVerified, async (req, res) => {
  try {
    const { orderId, paymentId, signature, status } = req.body || {}
    if (!orderId) return res.status(400).json({ error: 'orderId is required' })
    const payment = await Payment.findOne({ orderId, userId: req.user._id })
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (payment.status === 'paid' && payment.verified) {
      return res.json({ ok: true, duplicate: true, payment: serialize(payment) })
    }

    if (status === 'cancelled' || status === 'failed') {
      await failPayment(payment, status === 'cancelled' ? 'cancelled' : 'failed')
      return res.json({ ok: false, payment: serialize(payment) })
    }

    const valid =
      payment.provider === 'razorpay'
        ? verifyRazorpaySignature({ orderId, paymentId, signature })
        : verifyDevSignature({ orderId, paymentId, signature })

    if (!valid) {
      payment.signature = String(signature || '').slice(0, 200)
      await failPayment(payment, 'failed')
      return res.status(400).json({ error: 'Payment verification failed' })
    }

    const result = await finalizePayment(payment, { providerPaymentId: paymentId, signature })
    if (result.refunded) {
      return res.status(409).json({
        ok: false,
        refunded: true,
        error: 'This item was sold to someone else while you were paying. Your payment is being refunded.',
        payment: serialize(result.payment),
      })
    }
    res.json({ ok: true, duplicate: Boolean(result.duplicate), payment: serialize(result.payment) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/dev-complete', requireAuth, requireVerified, async (req, res) => {
  try {
    if (paymentMode() !== 'dev') {
      return res.status(400).json({ error: 'Dev payment simulator is disabled when Razorpay keys are configured' })
    }
    const { orderId, outcome = 'success' } = req.body || {}
    const payment = await Payment.findOne({ orderId, userId: req.user._id })
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (outcome !== 'success') {
      return res.json({
        orderId,
        paymentId: `pay_fail_${payment._id}`,
        signature: 'invalid',
        status: outcome,
      })
    }
    const paymentId = `pay_dev_${payment._id}`
    const signature = signDevPayment(orderId, paymentId)
    res.json({ orderId, paymentId, signature, status: 'success' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/refund', requireAuth, requireAdmin, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (payment.status !== 'paid') return res.status(400).json({ error: 'Only paid payments can be refunded' })
    await refundPayment(payment, String(req.body?.reason || 'Refunded by admin').slice(0, 200))
    if (payment.listingId) await Listing.updateOne({ _id: payment.listingId, status: 'sold' }, { $set: { status: 'active' } })
    await Notification.create({
      userId: payment.userId,
      title: 'Payment refunded',
      body: `₹${payment.amount} for "${payment.itemTitle || 'your order'}" was refunded.`,
      type: 'payment',
      relatedId: String(payment._id),
    })
    res.json({ ok: true, payment: serialize(payment) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', requireAuth, requireVerified, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    const uid = String(req.user._id)
    const involved = [String(payment.userId), String(payment.sellerId || '')].includes(uid)
    if (!involved && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    res.json(serialize(payment))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * Razorpay webhook (configure in Razorpay Dashboard -> Webhooks, events: payment.captured, payment.failed, order.paid).
 * Mounted in index.js with express.raw() because the signature is computed over the exact raw bytes.
 */
export async function razorpayWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return res.status(503).json({ error: 'Webhook secret not configured' })
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
  const given = String(req.headers['x-razorpay-signature'] || '')
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: 'Invalid signature' })

  try {
    const event = JSON.parse(raw.toString('utf8'))
    const entity = event?.payload?.payment?.entity
    const orderId = entity?.order_id || event?.payload?.order?.entity?.id
    const payment = orderId ? await Payment.findOne({ orderId }) : null
    if (payment) {
      if (['payment.captured', 'order.paid'].includes(event.event)) {
        await finalizePayment(payment, { providerPaymentId: entity?.id || '', signature: 'webhook' })
      } else if (event.event === 'payment.failed') {
        await failPayment(payment, 'failed')
      }
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('webhook error', err.message)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
}

export default router
