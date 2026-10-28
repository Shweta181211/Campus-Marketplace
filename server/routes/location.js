import { Router } from 'express'
import User from '../models/User.js'
import Listing from '../models/Listing.js'
import { requireAuth, requireVerified, publicUser } from '../middleware/auth.js'
import { encodeGeohash, validCoords } from '../utils/geohash.js'
import { findNearby, NearbyError } from '../utils/nearby.js'
import { serializeListing } from './listings.js'

const router = Router()
const STALE_MS = Number(process.env.LOCATION_STALE_MS || 7 * 24 * 60 * 60 * 1000)

function stripExact(user) {
  const json = publicUser(user)
  json.locationSharingEnabled = Boolean(user.locationSharingEnabled)
  json.locationApprox = user.locationApprox || null
  json.hasLocation = Boolean(user.locationApprox?.geohash)
  json.locationUpdatedAt = user.locationUpdatedAt
  return json
}

router.put('/preferences', requireAuth, requireVerified, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled ?? req.body.locationSharingEnabled)
    req.user.locationSharingEnabled = enabled
    if (!enabled) {
      req.user.locationExact = undefined
      req.user.locationApprox = { geohash: null, label: '' }
      req.user.locationUpdatedAt = null
      // Turning off *your own* discovery does not silently change your listings; pass clearListings:true to
      // also stop sharing the location of every listing you posted.
      if (req.body.clearListings) {
        await Listing.updateMany(
          { 'seller.userId': req.user._id },
          { $unset: { geo: 1, geoHash: 1 }, $set: { locationSharingEnabled: false } }
        )
      }
    }
    await req.user.save()
    res.json(stripExact(req.user))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/', requireAuth, requireVerified, async (req, res) => {
  try {
    if (!req.user.locationSharingEnabled) {
      return res.status(400).json({ error: 'Enable nearby marketplace discovery before sharing location' })
    }
    const lat = Number(req.body.lat ?? req.body.latitude)
    const lon = Number(req.body.lon ?? req.body.lng ?? req.body.longitude)
    if (!validCoords(lat, lon)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required' })
    }
    req.user.locationExact = { type: 'Point', coordinates: [lon, lat] }
    req.user.locationApprox = {
      geohash: encodeGeohash(lat, lon, 5),
      label: req.body.label || 'Campus area',
    }
    req.user.locationUpdatedAt = new Date()
    await req.user.save()
    res.json(stripExact(req.user))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/nearby', requireAuth, requireVerified, async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select('locationExact locationSharingEnabled locationUpdatedAt locationApprox')
    const { items } = await findNearby(me, { status: 'active' }, req.query.radiusKm)
    res.json(items.map(({ listing, distanceKm }) => ({
      ...serializeListing(listing, { viewer: me }),
      distanceKm,
      distanceLabel: `~${distanceKm} km away`,
    })))
  } catch (err) {
    if (err instanceof NearbyError) return res.status(err.code).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

export default router
