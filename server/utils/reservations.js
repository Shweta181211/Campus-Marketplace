import Listing from '../models/Listing.js'
import Payment from '../models/Payment.js'
import Transaction from '../models/Transaction.js'

export const RESERVATION_MS = Number(process.env.PAYMENT_RESERVATION_MINUTES || 15) * 60 * 1000

/** Put a listing back on sale if (and only if) it is still reserved. */
export async function releaseListing(listingId, { buyerId = null } = {}) {
  if (!listingId) return
  const filter = { _id: listingId, status: 'reserved' }
  if (buyerId) filter.reservedBy = buyerId
  await Listing.updateOne(filter, { $set: { status: 'active', reservedBy: null, reservedUntil: null } })
}

/**
 * Reservations stop two students paying for the same item. If a buyer abandons checkout the item
 * returns to the marketplace after RESERVATION_MS.
 */
export async function releaseExpiredReservations() {
  const expired = await Listing.find({ status: 'reserved', reservedUntil: { $lt: new Date() } }).select('_id reservedBy')
  for (const l of expired) {
    const open = await Payment.find({ listingId: l._id, status: 'created' }).select('_id transactionId')
    await Payment.updateMany({ _id: { $in: open.map((p) => p._id) } }, { $set: { status: 'cancelled' } })
    await Transaction.updateMany(
      { _id: { $in: open.map((p) => p.transactionId).filter(Boolean) }, status: 'PAYMENT_PENDING' },
      { $set: { status: 'CANCELLED' } }
    )
    await releaseListing(l._id)
  }
  return expired.length
}
