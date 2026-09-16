import crypto from 'crypto'
import Razorpay from 'razorpay'
import Payment from '../models/Payment.js'

export function paymentMode() {
  const hasKeys = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  if (hasKeys && process.env.PAYMENT_MODE !== 'dev') return 'razorpay'
  return 'dev'
}

export function getRazorpay() {
  if (paymentMode() !== 'razorpay') return null
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) return false
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signature || ''))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function verifyDevSignature({ orderId, paymentId, signature }) {
  const secret = process.env.PAYMENT_DEV_SECRET || process.env.JWT_SECRET || 'dev-pay-secret'
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signature || ''))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function signDevPayment(orderId, paymentId) {
  const secret = process.env.PAYMENT_DEV_SECRET || process.env.JWT_SECRET || 'dev-pay-secret'
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
}

export async function createProviderOrder({ amount, currency = 'INR', receipt, notes }) {
  const mode = paymentMode()
  if (mode === 'razorpay') {
    const client = getRazorpay()
    const order = await client.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt,
      notes,
    })
    return {
      provider: 'razorpay',
      orderId: order.id,
      amount,
      currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    }
  }

  const orderId = `dev_order_${crypto.randomBytes(8).toString('hex')}`
  return {
    provider: 'dev',
    orderId,
    amount,
    currency,
    keyId: null,
    notice: 'Development payment mode. No money is collected. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable Razorpay test checkout.',
  }
}

export { Payment }
