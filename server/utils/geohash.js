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

function seededUnit(key, salt) {
  // deterministic 0..1 from a string, so the same listing always gets the same offset
  // (re-reading it can't be used to average the noise away)
  let h = 2166136261
  const s = `${key}:${salt}`
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

/**
 * Privacy blur for a listing's stored location: move the point 80-220 m in a random but
 * deterministic direction.  The server never keeps a seller's exact doorstep (hostel room, house).
 */
export function fuzzPoint(lat, lon, key) {
  const distM = 80 + seededUnit(key, 'd') * 140
  const bearing = seededUnit(key, 'b') * 2 * Math.PI
  const dLat = (distM * Math.cos(bearing)) / 111320
  const dLon = (distM * Math.sin(bearing)) / (111320 * Math.cos((lat * Math.PI) / 180))
  return { lat: lat + dLat, lon: lon + dLon }
}

export function validCoords(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}
