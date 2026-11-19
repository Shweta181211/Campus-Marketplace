# Week 5 : Location Sharing Risked Exposing Students

# Blurred, Opt-in Nearby Search

## Problem:

Nearby discovery needs coordinates, but exact positions of
hostel rooms must never leak.

## Relevant Context

Two separate opt-ins (buyer and seller), both off by default.
A buyer's location expires after seven days.

## Key Observation

Store a **displaced** point, and keep the displacement the
same for one listing so it cannot be averaged out.

## Solution

Deterministic 80 to 220 m offset (`server/utils/geohash.js`):

``` javascript
export function fuzzPoint(lat, lon, key) {
  const distM = 80 + seededUnit(key, 'd') * 140
  const bearing = seededUnit(key, 'b') * 2 * Math.PI
  const dLat = (distM * Math.cos(bearing)) / 111320
  const dLon = (distM * Math.sin(bearing)) / (111320 * Math.cos((lat * Math.PI) / 180))
  return { lat: lat + dLat, lon: lon + dLon }
}
```

Search uses a bounding box, then the haversine distance, and
returns only `~1.2 km away`, never coordinates.

**Because**

A seeded offset gives the same blurred point every time, so
repeated queries reveal nothing more than one query.
