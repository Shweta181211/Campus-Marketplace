import Watchlist from '../models/Watchlist.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import { sendEmail } from './email.js'

/**
 * Price-drop alerts (PDF section 9).  Basic rule: PriceDrop = 1 if P_new < P_old.
 * Refinement: each watcher can require a minimum drop (percent or fixed rupees).  The comparison is against the
 * price the watcher last *observed* (stored on the watch row), so several small drops add up.
 */
export function shouldAlert(watch, newPrice) {
  const old = Number(watch.lastObservedPrice)
  if (!watch.alertEnabled || !Number.isFinite(old) || !(newPrice < old)) return false
  const drop = old - newPrice
  if (watch.thresholdType === 'percent') return (drop / old) * 100 >= Number(watch.thresholdValue || 0)
  if (watch.thresholdType === 'amount') return drop >= Number(watch.thresholdValue || 0)
  return true
}

export async function notifyPriceDrop(listing, oldPrice, newPrice) {
  if (!(newPrice < oldPrice)) {
    // price went up: just move every watcher's reference point
    await Watchlist.updateMany({ listingId: listing._id }, { $set: { lastObservedPrice: newPrice } })
    return 0
  }
  const watches = await Watchlist.find({ listingId: listing._id })
  let sent = 0
  for (const w of watches) {
    if (String(w.userId) === String(listing.seller?.userId)) continue
    if (w.lastObservedPrice == null) w.lastObservedPrice = oldPrice
    if (!shouldAlert(w, newPrice)) continue
    const pct = Math.round(((w.lastObservedPrice - newPrice) / w.lastObservedPrice) * 100)
    const body = `"${listing.title}" dropped from ₹${w.lastObservedPrice} to ₹${newPrice} (${pct}% off).`
    await Notification.create({ userId: w.userId, title: 'Price drop on a watched item', body, type: 'price_drop', relatedId: String(listing._id) })
    const watcher = await User.findById(w.userId).select('email emailAlerts')
    if (watcher?.email && process.env.PRICE_DROP_EMAILS === 'true') {
      sendEmail(watcher.email, 'Price drop on Campus Marketplace', body).catch(() => {})
    }
    w.lastObservedPrice = newPrice
    w.lastAlertAt = new Date()
    await w.save()
    sent += 1
  }
  return sent
}
