import { Router } from 'express'
import Listing from '../models/Listing.js'
import User from '../models/User.js'
import Watchlist from '../models/Watchlist.js'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { recommendPrice, hashText, assessListingFraud, applyFraudDecision } from '../utils/ai.js'
import { encodeGeohash, haversineKm, roundDistanceKm } from '../utils/geohash.js'
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
  delete obj.geo
  if (!includePrivateGeo) {
    obj.geoHash = obj.geoHash ? String(obj.geoHash).slice(0, 5) : null
  }
  return {
    ...obj,
    id: obj._id?.toString?.() || obj.id,
    distanceKm,
    distanceLabel: distanceKm != null ? `~${distanceKm} km away` : null,
  }
}

router.get('/', requireAuth, requireVerified, async (req, res) => {
  try {
    const { type, category, search, condition, maxPrice, sort, nearby, radiusKm } = req.query
    const filter = { status: { $in: ['active'] } }

    if (type === 'buy' || type === 'sale') filter.type = { $in: ['buy', 'sale'] }
    if (type === 'lend' || type === 'borrow') filter.type = { $in: ['lend', 'borrow'] }
    if (category) filter.category = category
    if (condition) filter.condition = condition
    if (maxPrice) filter.price = { $lte: Number(maxPrice) }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
      ]
    }

    const viewer = await User.findById(req.user._id).select('+locationExact locationSharingEnabled')
    const wantNearby = nearby === 'true' || sort === 'nearby'

    if (wantNearby) {
      if (!viewer.locationSharingEnabled || !viewer.locationExact?.coordinates) {
        return res.status(400).json({ error: 'Enable nearby marketplace discovery in settings first' })
      }
      const radius = Number(radiusKm || 3)
      filter.locationSharingEnabled = true
      filter.geo = {
        $near: {
          $geometry: { type: 'Point', coordinates: viewer.locationExact.coordinates },
          $maxDistance: radius * 1000,
        },
      }
    }

    let query = Listing.find(filter)
    if (!wantNearby) {
      if (sort === 'price-asc') query = query.sort({ price: 1 })
      else if (sort === 'price-desc') query = query.sort({ price: -1 })
      else query = query.sort({ createdAt: -1 })
    }

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
    const viewer = await User.findById(req.user._id).select('+locationExact locationSharingEnabled')
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
      images: Array.isArray(images) ? images.filter((u) => typeof u === 'string' && u.startsWith('data:image')).slice(0, 6) : [],
      status: 'active',
      views: 0,
      messageCount: 0,
      isSeed: false,
    })

    if (shareLocation && sellerUser.locationSharingEnabled) {
      const fresh = await User.findById(sellerUser._id).select('+locationExact locationSharingEnabled locationApprox')
      if (fresh?.locationExact?.coordinates) {
        listing.geo = fresh.locationExact
        listing.geoHash = encodeGeohash(fresh.locationExact.coordinates[1], fresh.locationExact.coordinates[0], 5)
        listing.locationSharingEnabled = true
      }
    }

    const assessment = await assessListingFraud({ listing: listing.toObject(), seller: sellerUser })
    await applyFraudDecision(listing, assessment, sellerUser)

    await User.findByIdAndUpdate(sellerUser._id, { $inc: { listingsCount: 1 } })
    await recomputeTrustScore(sellerUser._id)

    const out = serializeListing(listing)
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

async function updateListing(req, res) {
  try {
    const listing = await Listing.findById(req.params.id)
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    if (String(listing.seller?.userId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    const allowed = [
      'title',
      'description',
      'price',
      'askingPrice',
      'condition',
      'brand',
      'status',
      'defaultDueDays',
      'lendUnit',
    ]
    for (const key of allowed) {
      if (req.body[key] !== undefined) listing[key] = req.body[key]
    }
    if (req.body.price != null) listing.price = Number(req.body.price)
    if (req.body.description) listing.descriptionHash = hashText(req.body.description)
    await listing.save()
    res.json(serializeListing(listing))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

router.put('/:id', requireAuth, requireVerified, updateListing)
router.patch('/:id', requireAuth, requireVerified, updateListing)

router.delete('/:id', requireAuth, requireVerified, async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id)
    if (!listing) return res.status(404).json({ error: 'Listing not found' })
    if (String(listing.seller?.userId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    listing.status = 'removed'
    await listing.save()
    await Watchlist.deleteMany({ listingId: listing._id })
    res.json({ ok: true, id: listing._id.toString() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
