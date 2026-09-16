import { Router } from 'express'
import User from '../models/User.js'
import Listing from '../models/Listing.js'
import { requireAuth, requireVerified, publicUser } from '../middleware/auth.js'
import { encodeGeohash, haversineKm, roundDistanceKm } from '../utils/geohash.js'
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
      await Listing.updateMany(
        { 'seller.userId': req.user._id },
        { $unset: { geo: 1, geoHash: 1 }, $set: { locationSharingEnabled: false } }
      )
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
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
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
    const me = await User.findById(req.user._id).select('+locationExact locationSharingEnabled locationUpdatedAt locationApprox')
    if (!me.locationSharingEnabled) {
      return res.status(400).json({ error: 'Nearby discovery is off' })
    }
    if (!me.locationExact?.coordinates) {
      return res.status(400).json({ error: 'Location permission denied or location not stored' })
    }
    if (me.locationUpdatedAt && Date.now() - new Date(me.locationUpdatedAt).getTime() > STALE_MS) {
      me.locationSharingEnabled = false
      me.locationExact = undefined
      await me.save()
      return res.status(400).json({ error: 'Stored location expired. Enable discovery again.' })
    }

    const radius = Number(req.query.radiusKm || 3)
    const listings = await Listing.find({
      status: 'active',
      locationSharingEnabled: true,
      geo: {
        $near: {
          $geometry: { type: 'Point', coordinates: me.locationExact.coordinates },
          $maxDistance: radius * 1000,
        },
      },
    }).lean()

    res.json(
      listings.map((l) => {
        const serialized = serializeListing(l, { viewer: me })
        if (l.geo?.coordinates) {
          serialized.distanceKm = roundDistanceKm(
            haversineKm(me.locationExact.coordinates[1], me.locationExact.coordinates[0], l.geo.coordinates[1], l.geo.coordinates[0])
          )
          serialized.distanceLabel = `~${serialized.distanceKm} km away`
        }
        return serialized
      })
    )
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
