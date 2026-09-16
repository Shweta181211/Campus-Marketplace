const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export function encodeGeohash(lat, lon, precision = 5) {
  let minLat = -90
  let maxLat = 90
  let minLon = -180
  let maxLon = 180
  let hash = ''
  let bit = 0
  let ch = 0
  let even = true

  while (hash.length < precision) {
    if (even) {
      const mid = (minLon + maxLon) / 2
      if (lon >= mid) {
        ch |= 1 << (4 - bit)
        minLon = mid
      } else {
        maxLon = mid
      }
    } else {
      const mid = (minLat + maxLat) / 2
      if (lat >= mid) {
        ch |= 1 << (4 - bit)
        minLat = mid
      } else {
        maxLat = mid
      }
    }
    even = !even
    if (bit < 4) bit += 1
    else {
      hash += BASE32[ch]
      bit = 0
      ch = 0
    }
  }
  return hash
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function roundDistanceKm(km) {
  if (km == null || Number.isNaN(km)) return null
  if (km < 0.1) return 0.1
  return Math.round(km * 10) / 10
}

/** Approximate public point: ~1km grid, never the exact stored coordinate. */
export function approximatePoint(lat, lon) {
  const q = (n) => Math.round(n * 100) / 100
  return { lat: q(lat), lon: q(lon) }
}
