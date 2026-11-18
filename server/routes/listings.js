import { Router } from 'express'
import Listing from '../models/Listing.js'
import User from '../models/User.js'
import Watchlist from '../models/Watchlist.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { recommendPrice, hashText, assessListingFraud, applyFraudDecision } from '../utils/ai.js'
import { encodeGeohash, haversineKm, roundDistanceKm, fuzzPoint, validCoords } from '../utils/geohash.js'
import { findNearby, NearbyError } from '../utils/nearby.js'
import { resolveListingImages, attachAssets, deleteAssets, deleteListingImages } from '../utils/uploads.js'
import Upload from '../models/Upload.js'
import { recomputeTrustScore } from '../utils/trust.js'

const router = Router()

export const CATEGORY_META = {
  books: { iconKey: 'books', tape: 'yellow', bg: 'yellow' },
  cycles: { iconKey: 'cycles', tape: 'sky', bg: 'sky' },
  electronics: { iconKey: 'electronics', tape: 'coral', bg: 'coral' },
  lab: { iconKey: 'lab', tape: 'moss', bg: 'moss' },
  furniture: { iconKey: 'furniture', tape: 'yellow', bg: 'yellow' },
  hostel: { iconKey: 'hostel', tape: 'sky', bg: 'sky' },
  notes: { iconKey: 'notes', tape: 'coral', bg: 'coral' },
  other: { iconKey: 'other', tape: 'moss', bg: 'moss' },
}

function normalizeType(listingType) {
  if (listingType === 'lend' || listingType === 'borrow') return 'lend'
  return 'buy'
}

export function serializeListing(doc, { viewer = null, includePrivateGeo = false } = {}) {
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  const coords = obj.geo?.coordinates
  let distanceKm = null
  if (viewer?.locationSharingEnabled && viewer.locationExact?.coordinates && coords?.length === 2) {
    distanceKm = roundDistanceKm(
      haversineKm(viewer.locationExact.coordinates[1], viewer.locationExact.coordinates[0], coords[1], coords[0])
    )
  }
  const locationShared = Boolean(obj.locationSharingEnabled && coords?.length === 2)
  delete obj.geo
  delete obj.reservedBy
  if (!includePrivateGeo) {
    obj.geoHash = obj.geoHash ? String(obj.geoHash).slice(0, 5) : null
  }
  return {
    ...obj,
    id: obj._id?.toString?.() || obj.id,
    distanceKm,
    locationShared,
    distanceLabel: distanceKm != null ? `~${distanceKm} km away` : null,
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Apply a seller's per-listing location choice. Stored coordinates are blurred (80-220 m). */
function applyListingLocation(listing, { lat, lon }) {
  const p = fuzzPoint(lat, lon, String(listing._id))
  listing.geo = { type: 'Point', coordinates: [p.lon, p.lat] }
  listing.geoHash = encodeGeohash(p.lat, p.lon, 5)
  listing.locationSharingEnabled = true
}

function clearListingLocation(listing) {
  listing.geo = undefined
  listing.geoHash = null
  listing.locationSharingEnabled = false
}

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const { type, category, search, condition, maxPrice, sort, nearby, radiusKm } = req.query
    const filter = { status: 'active' }

    if (type === 'buy' || type === 'sale') filter.type = { $in: ['buy', 'sale'] }
    if (type === 'lend' || type === 'borrow') filter.type = { $in: ['lend', 'borrow'] }
    if (category) filter.category = String(category)
    if (condition) filter.condition = String(condition)
    if (maxPrice && Number.isFinite(Number(maxPrice))) filter.price = { $lte: Number(maxPrice) }
    if (search) {
      const rx = { $regex: escapeRegex(String(search).slice(0, 80)), $options: 'i' }
      filter.$or = [{ title: rx }, { category: rx }, { description: rx }, { brand: rx }]
    }

    const viewer = await User.findById(req.user._id).select('locationExact locationSharingEnabled locationUpdatedAt')
    const wantNearby = nearby === 'true' || sort === 'nearby'

    if (wantNearby) {
      try {
        const { items } = await findNearby(viewer, filter, radiusKm)
        return res.json(items.map(({ listing }) => serializeListing(listing, { viewer })))
      } catch (err) {
        if (err instanceof NearbyError) return res.status(err.code).json({ error: err.message })
        throw err
      }
    }

    let query = Listing.find(filter)
    if (sort === 'price-asc') query = query.sort({ price: 1 })
    else if (sort === 'price-desc') query = query.sort({ price: -1 })
    else query = query.sort({ createdAt: -1 })

    const listings = await query.lean()
    res.json(listings.map((l) => serializeListing(l, { viewer })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/mine', requireAuth, requireVerified, async (req, res) => {
  try {
    const listings = await Listing.find({
      'seller.userId': req.user._id,
      status: { $ne: 'removed' },
    })
      .sort({ createdAt: -1 })
      .lean()
    res.json(listings.map((l) => serializeListing(l)))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', requireAuth, requireVerified, async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true })
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    const viewer = await User.findById(req.user._id).select('locationExact locationSharingEnabled locationUpdatedAt')
    res.json(serializeListing(listing, { viewer }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const {
      title,
      description = '',
      category,
      condition,
      listingType,
      price,
      originalPrice,
      askingPrice,
      brand = '',
      ageMonths = 0,
      demand = 50,
      lendUnit = 'day',
      defaultDueDays = 7,
      images = [],
      location = 'Campus (approx.)',
      shareLocation = false,
      lat,
      lon,
    } = req.body

    if (!title || !category || !condition || price == null) {
      return res.status(400).json({ error: 'title, category, condition and price are required' })
    }

    const type = normalizeType(listingType)
    const meta = CATEGORY_META[category] || CATEGORY_META.other
    const numericPrice = Number(askingPrice ?? price)
    const orig = Number(originalPrice || numericPrice)

    const ai = await recommendPrice({
      category,
      brand,
      title,
      originalPrice: orig,
      ageMonths: Number(ageMonths) || 0,
      condition,
      demand: Number(demand) || 50,
      listingType: type === 'lend' ? 'lend' : 'sale',
      lendUnit: type === 'lend' ? lendUnit : 'day',
    })

    const sellerUser = req.user
    const listing = new Listing({
      title,
      description,
      descriptionHash: hashText(description),
      category,
      condition,
      brand,
      originalPrice: orig,
      askingPrice: numericPrice,
      ageMonths: Number(ageMonths) || 0,
      demand: Number(demand) || 50,
      price: numericPrice,
      type,
      listingKind: type === 'lend' ? 'lend' : 'sale',
      lendUnit: type === 'lend' ? lendUnit : null,
      defaultDueDays: type === 'lend' ? Number(defaultDueDays) || 7 : null,
      location,
      iconKey: meta.iconKey,
      tape: meta.tape,
      bg: meta.bg,
      seller: {
        name: sellerUser.name,
        trust: sellerUser.trust,
        trustScore: sellerUser.trustScore,
        avatar: sellerUser.avatar,
        verified: sellerUser.verified,
        userId: sellerUser._id,
      },
      fairMin: ai.minFairPrice || Math.round(numericPrice * 0.85),
      fairMax: ai.maxFairPrice || Math.round(numericPrice * 1.15),
      recommendedPrice: ai.recommendedPrice || 0,
      confidence: ai.confidence || 0,
      priceExplanation: ai.explanation || '',
      aiSource: ai.source,
      images: [],
      status: 'active',
      views: 0,
      messageCount: 0,
      isSeed: false,
    })

    // Photos: only URLs this user uploaded through /api/uploads/images are accepted.
    const resolved = await resolveListingImages(images, sellerUser._id, null)
    if (resolved.error) return res.status(400).json({ error: resolved.error })
    listing.images = resolved.assets.map((a) => a.url)

    // Location is strictly opt-in per listing. Prefer the coordinates the browser just sent; fall back to the
    // seller's stored profile location (only if they enabled it there).
    let locationNote = null
    if (shareLocation) {
      let point = null
      const la = Number(lat)
      const lo = Number(lon)
      if (lat != null && lon != null && validCoords(la, lo)) point = { lat: la, lon: lo }
      else if (sellerUser.locationSharingEnabled) {
        const fresh = await User.findById(sellerUser._id).select('locationExact')
        const c = fresh?.locationExact?.coordinates
        if (c?.length === 2) point = { lat: c[1], lon: c[0] }
      }
      if (point) applyListingLocation(listing, point)
      else locationNote = 'Location was not shared because no valid location was available. You can add it later from My listings.'
    }

    const assessment = await assessListingFraud({ listing: listing.toObject(), seller: sellerUser })
    await applyFraudDecision(listing, assessment, sellerUser)

    await attachAssets(resolved.assets, listing._id)
    await User.updateOne({ _id: sellerUser._id }, { $inc: { listingsCount: 1 } })
    await recomputeTrustScore(sellerUser._id)

    const out = serializeListing(listing)
    out.locationNote = locationNote
    out.fraudWarning =
      listing.fraudRiskLevel === 'MEDIUM'
        ? 'This listing was published with extra review signals. A cheap price alone is not treated as fraud.'
        : listing.fraudRiskLevel === 'HIGH'
          ? 'Listing is held for admin review and is not public yet.'
          : null
    res.status(201).json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

async function loadOwned(req, res) {
  const listing = await Listing.findById(req.params.id)
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' })
    return null
  }
  if (String(listing.seller?.userId) !== String(req.user._id) && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Insufficient permissions' })
    return null
  }
  return listing
}

async function updateListing(req, res) {
  try {
    const listing = await loadOwned(req, res)
    if (!listing) return
    const isAdmin = req.user.role === 'admin'
    const allowed = ['title', 'description', 'price', 'askingPrice', 'condition', 'brand', 'defaultDueDays', 'lendUnit']
    for (const key of allowed) {
      if (req.body[key] !== undefined) listing[key] = req.body[key]
    }
    if (req.body.price != null) listing.price = Number(req.body.price)
    if (req.body.description) listing.descriptionHash = hashText(req.body.description)

    // Owners can only toggle active/sold/removed, and cannot lift a fraud hold or a payment reservation.
    if (req.body.status !== undefined) {
      const locked = ['held', 'reserved'].includes(listing.status)
      if (isAdmin) listing.status = req.body.status
      else if (!locked && ['active', 'sold', 'removed'].includes(req.body.status)) listing.status = req.body.status
      else return res.status(400).json({ error: 'This listing status cannot be changed right now' })
    }

    if (Array.isArray(req.body.images)) {
      const resolved = await resolveListingImages(req.body.images, listing.seller.userId, listing._id)
      if (resolved.error) return res.status(400).json({ error: resolved.error })
      const keep = new Set(resolved.assets.map((a) => a.url))
      const dropped = await Upload.find({ listingId: listing._id, url: { $nin: [...keep] } })
      await attachAssets(resolved.assets, listing._id)
      await deleteAssets(dropped)
      listing.images = resolved.assets.map((a) => a.url)
    }

    await listing.save()
    res.json(serializeListing(listing))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

router.put('/:id', requireAuth, requireVerified, updateListing)
router.patch('/:id', requireAuth, requireVerified, updateListing)

// Seller opts a listing in/out of nearby discovery after publishing.
router.put('/:id/location', requireAuth, requireVerified, async (req, res) => {
  try {
    const listing = await loadOwned(req, res)
    if (!listing) return
    const share = Boolean(req.body.share ?? req.body.enabled)
    if (!share) {
      clearListingLocation(listing)
    } else {
      const la = Number(req.body.lat ?? req.body.latitude)
      const lo = Number(req.body.lon ?? req.body.lng ?? req.body.longitude)
      if (!validCoords(la, lo)) return res.status(400).json({ error: 'Valid latitude and longitude are required to share location' })
      applyListingLocation(listing, { lat: la, lon: lo })
    }
    await listing.save()
    res.json(serializeListing(listing))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', requireAuth, requireVerified, async (req, res) => {
  try {
    const listing = await loadOwned(req, res)
    if (!listing) return
    listing.status = 'removed'
    listing.images = []
    clearListingLocation(listing)
    await listing.save()
    await Watchlist.deleteMany({ listingId: listing._id })
    await deleteListingImages(listing._id) // free the cloud storage too
    res.json({ ok: true, id: listing._id.toString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
