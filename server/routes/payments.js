import { Router } from 'express'
import Payment from '../models/Payment.js'
import Transaction from '../models/Transaction.js'
import Listing from '../models/Listing.js'
import Notification from '../models/Notification.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import {
  createProviderOrder,
  paymentMode,
  verifyRazorpaySignature,
  verifyDevSignature,
  signDevPayment,
} from '../utils/payments.js'

const router = Router()

function serialize(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  return { ...obj, id: obj._id.toString(), paymentId: obj._id.toString() }
}

router.post('/create-order', requireAuth, requireVerified, async (req, res) => {
  try {
    const { listingId, transactionId, amount } = req.body || {}
    let listing = null
    let txn = null
    if (listingId) listing = await Listing.findById(listingId)
    if (transactionId) txn = await Transaction.findById(transactionId)
    if (!listing && txn?.listingId) listing = await Listing.findById(txn.listingId)
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    if (listing.status !== 'active') {
      return res.status(400).json({ error: 'Listing is not available for purchase' })
    }
    if (listing.type === 'lend') {
      return res.status(400).json({ error: 'Use borrow workflow for lend listings' })
    }

    const rupees = Number(amount || listing.price)
    if (!Number.isFinite(rupees) || rupees <= 0) return res.status(400).json({ error: 'Invalid amount' })

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

    const order = await createProviderOrder({
      amount: rupees,
      receipt: `txn_${txn._id}`,
      notes: { listingId: String(listing._id), userId: String(req.user._id) },
    })

    const payment = await Payment.create({
      orderId: order.orderId,
      transactionId: txn._id,
      listingId: listing._id,
      userId: req.user._id,
      amount: rupees,
      currency: 'INR',
      status: 'created',
      provider: order.provider,
    })
    txn.paymentId = payment._id
    await txn.save()

    res.status(201).json({
      ...order,
      paymentId: payment._id.toString(),
      transactionId: txn._id.toString(),
      amount: rupees,
      currency: 'INR',
      mode: paymentMode(),
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
      payment.status = status === 'cancelled' ? 'cancelled' : 'failed'
      await payment.save()
      return res.json({ ok: false, payment: serialize(payment) })
    }

    const mode = payment.provider
    let valid = false
    if (mode === 'razorpay') {
      valid = verifyRazorpaySignature({ orderId, paymentId, signature })
    } else {
      valid = verifyDevSignature({ orderId, paymentId, signature })
    }

    if (!valid) {
      payment.status = 'failed'
      payment.signature = signature || ''
      await payment.save()
      return res.status(400).json({ error: 'Payment verification failed' })
    }

    payment.status = 'paid'
    payment.verified = true
    payment.providerPaymentId = paymentId
    payment.signature = signature
    await payment.save()

    if (payment.transactionId) {
      await Transaction.findByIdAndUpdate(payment.transactionId, {
        status: 'PAID',
        completedAt: new Date(),
      })
    }
    if (payment.listingId) {
      await Listing.findByIdAndUpdate(payment.listingId, { status: 'sold' })
    }
    await Notification.create({
      userId: req.user._id,
      title: 'Payment successful',
      body: `Payment of ₹${payment.amount} was verified by the server.`,
      type: 'payment',
      relatedId: String(payment._id),
    })

    res.json({ ok: true, payment: serialize(payment) })
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

router.get('/:id', requireAuth, requireVerified, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
    if (!payment) return res.status(404).json({ error: 'Payment not found' })
    if (String(payment.userId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    res.json(serialize(payment))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
