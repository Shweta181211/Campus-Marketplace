import Listing from '../models/Listing.js'
import { haversineKm, roundDistanceKm } from './geohash.js'

const STALE_MS = () => Number(process.env.LOCATION_STALE_MS || 7 * 24 * 60 * 60 * 1000)

export class NearbyError extends Error {
  constructor(message, code = 400) {
    super(message)
    this.code = code
  }
}

/**
 * Nearby discovery done in application code (bounding box -> haversine) instead of $near, so it works on
 * any MongoDB deployment (Atlas, local, in-memory) and the radius filter composes with every other filter.
 * Only listings whose sellers explicitly opted in (locationSharingEnabled) are considered, and only
 * viewers who opted in can search.
 *
 * @param viewer  User doc loaded with locationExact
 * @param filter  extra Mongo filter (type, category, price...)
 */
export async function findNearby(viewer, filter = {}, radiusKm = 3) {
  if (!viewer?.locationSharingEnabled) throw new NearbyError('Enable nearby marketplace discovery in your profile first')
  const coords = viewer.locationExact?.coordinates
  if (!coords?.length) throw new NearbyError('Location permission denied or location not stored')
  if (viewer.locationUpdatedAt && Date.now() - new Date(viewer.locationUpdatedAt).getTime() > STALE_MS()) {
    viewer.locationSharingEnabled = false
    viewer.locationExact = undefined
    await viewer.save()
    throw new NearbyError('Stored location expired. Enable discovery again.')
  }
  const radius = Math.min(50, Math.max(0.5, Number(radiusKm) || 3))
  const [lon, lat] = coords

  // cheap bounding box first (1 degree latitude ~ 111 km)
  const dLat = radius / 111
  const dLon = radius / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  const candidates = await Listing.find({
    ...filter,
    locationSharingEnabled: true,
    'geo.coordinates.0': { $gte: lon - dLon, $lte: lon + dLon },
    'geo.coordinates.1': { $gte: lat - dLat, $lte: lat + dLat },
  }).lean()

  const out = []
  for (const l of candidates) {
    const c = l.geo?.coordinates
    if (!c || c.length !== 2) continue
    const km = haversineKm(lat, lon, c[1], c[0])
    if (km <= radius) out.push({ listing: l, distanceKm: roundDistanceKm(km), rawKm: km })
  }
  out.sort((a, b) => a.rawKm - b.rawKm)
  return { items: out, radiusKm: radius }
}
