import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-uploads-'))
process.env.USE_MEMORY_DB = process.env.USE_MEMORY_DB || 'true'
process.env.JWT_SECRET = 'test-jwt'
process.env.OTP_PEPPER = 'test-otp'
process.env.ALLOWED_COLLEGE_DOMAINS = 'campus.edu,thapar.edu'
process.env.PAYMENT_DEV_SECRET = 'pay-test'
process.env.PAYMENT_MODE = 'dev'
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test'
process.env.SEED_PASSWORD = 'CampusDemo123!'
process.env.SEED_ADMIN_PASSWORD = 'CampusAdmin123!'
process.env.LOCAL_UPLOAD_DIR = uploadDir
process.env.STORAGE_PROVIDER = 'local'
delete process.env.CLOUDINARY_URL

// A tiny stand-in for the FastAPI ML service so we can prove the model's answer is passed through untouched.
let mlMode = 'ok'
const ml = createServer((req, res) => {
  if (mlMode === 'down') { res.statusCode = 503; return res.end('{"detail":"down"}') }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/ai/price-predict') {
      return res.end(JSON.stringify({ recommendedPrice: 500, minFairPrice: 400, maxFairPrice: 640, confidence: 81, explanation: 'stub model', source: 'ml' }))
    }
    res.statusCode = 404
    res.end('{}')
  })
})
await new Promise((r) => ml.listen(0, r))
process.env.ML_SERVICE_URL = `http://127.0.0.1:${ml.address().port}`

const { connectDB, disconnectDB } = await import('../db.js')
const { seedDatabase } = await import('../seed.js')
const { app } = await import('../index.js')
const User = (await import('../models/User.js')).default
const Listing = (await import('../models/Listing.js')).default
const Payment = (await import('../models/Payment.js')).default
const storage = await import('../utils/storage.js')
const { fuzzPoint, haversineKm } = await import('../utils/geohash.js')
const { releaseExpiredReservations } = await import('../utils/reservations.js')
const { v2: cloudinary } = await import('cloudinary')

await connectDB()
await seedDatabase({ clear: true })
const server = createServer(app)
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

after(async () => {
  server.close()
  ml.close()
  await disconnectDB().catch(() => {})
  fs.rmSync(uploadDir, { recursive: true, force: true })
  process.exit(0)
})

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function api(p, { method = 'GET', token, body, raw, headers = {} } = {}) {
  const res = await fetch(`${base}/api${p}`, {
    method,
    headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}
async function login(email, password = 'CampusDemo123!') {
  const r = await api('/auth/login', { method: 'POST', body: { email, password } })
  assert.equal(r.status, 200, r.data.error)
  return r.data.token
}
async function upload(token, files = [{ buf: PNG, name: 'a.png', type: 'image/png' }]) {
  const fd = new FormData()
  for (const f of files) fd.append('images', new Blob([f.buf], { type: f.type }), f.name)
  return api('/uploads/images', { method: 'POST', token, raw: fd })
}
const newListing = (over = {}) => ({
  title: `Test item ${crypto.randomBytes(3).toString('hex')}`, category: 'books', condition: 'Good',
  originalPrice: 500, price: 300, askingPrice: 300, ageMonths: 6, listingType: 'sell',
  description: `desc ${crypto.randomBytes(4).toString('hex')}`, ...over,
})

const riyaToken = await login('riya.sharma@campus.edu')
const riya = (await api('/auth/me', { token: riyaToken })).data
const other = await User.findOne({ isSeed: true, role: 'student', email: { $ne: 'riya.sharma@campus.edu' } })
const otherToken = await login(other.email)
const adminToken = await login('admin@campus.edu', 'CampusAdmin123!')

// ───────────────────────────── cloud image storage ─────────────────────────────

test('upload status reports provider', async () => {
  const r = await api('/uploads/status', { token: riyaToken })
  assert.equal(r.status, 200)
  assert.equal(r.data.provider, 'local')
  assert.equal(r.data.durable, false)
})

test('image upload requires auth and a real image', async () => {
  const noAuth = await upload(undefined)
  assert.equal(noAuth.status, 401)
  const fake = await upload(riyaToken, [{ buf: Buffer.from('<script>alert(1)</script> not an image'), name: 'evil.png', type: 'image/png' }])
  assert.equal(fake.status, 400)
  const empty = await api('/uploads/images', { method: 'POST', token: riyaToken, raw: new FormData() })
  assert.equal(empty.status, 400)
})

test('image upload -> listing keeps URL only (no base64), file is served, removing frees storage', async () => {
  const up = await upload(riyaToken, [
    { buf: PNG, name: 'one.png', type: 'image/png' },
    { buf: PNG, name: 'two.png', type: 'image/png' },
  ])
  assert.equal(up.status, 201)
  assert.equal(up.data.images.length, 2)
  const [a, b] = up.data.images
  assert.match(a.url, /\/uploads\//)
  const served = await fetch(`${base}${new URL(a.url, base).pathname}`)
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff')

  const created = await api('/listings', { method: 'POST', token: riyaToken, body: newListing({ images: [a.url, b.url] }) })
  assert.equal(created.status, 201, created.data.error)
  assert.deepEqual(created.data.images, [a.url, b.url])
  assert.ok(!JSON.stringify(created.data).includes('data:image'))

  // someone else cannot attach my photos, and arbitrary URLs are rejected
  const steal = await api('/listings', { method: 'POST', token: otherToken, body: newListing({ images: [a.url] }) })
  assert.equal(steal.status, 400)
  const hotlink = await api('/listings', { method: 'POST', token: riyaToken, body: newListing({ images: ['https://evil.example/x.png'] }) })
  assert.equal(hotlink.status, 400)

  // attached images cannot be deleted from the uploads endpoint
  const del = await api(`/uploads/images/${a.id}`, { method: 'DELETE', token: riyaToken })
  assert.equal(del.status, 409)

  // replacing images removes the dropped one from storage
  const upd = await api(`/listings/${created.data.id}`, { method: 'PUT', token: riyaToken, body: { images: [a.url] } })
  assert.equal(upd.status, 200)
  assert.deepEqual(upd.data.images, [a.url])
  assert.equal((await fetch(`${base}${new URL(b.url, base).pathname}`)).status, 404)

  // deleting the listing deletes the remaining file
  const rm = await api(`/listings/${created.data.id}`, { method: 'DELETE', token: riyaToken })
  assert.equal(rm.status, 200)
  assert.equal((await fetch(`${base}${new URL(a.url, base).pathname}`)).status, 404)
})

test('unused upload can be deleted by its owner only', async () => {
  const up = await upload(riyaToken)
  const id = up.data.images[0].id
  assert.equal((await api(`/uploads/images/${id}`, { method: 'DELETE', token: otherToken })).status, 404)
  assert.equal((await api(`/uploads/images/${id}`, { method: 'DELETE', token: riyaToken })).status, 200)
})

test('cloudinary provider uploads resized image and returns CDN url (SDK stubbed)', async () => {
  const saved = { env: { ...process.env } }
  process.env.STORAGE_PROVIDER = 'cloud'
  process.env.CLOUDINARY_CLOUD_NAME = 'demo'
  process.env.CLOUDINARY_API_KEY = 'k'
  process.env.CLOUDINARY_API_SECRET = 's'
  const origStream = cloudinary.uploader.upload_stream
  const origDestroy = cloudinary.uploader.destroy
  let opts = null
  let destroyed = null
  cloudinary.uploader.upload_stream = (o, cb) => {
    opts = o
    return { end: () => cb(null, { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/campus-marketplace/listings/x.jpg', public_id: 'campus-marketplace/listings/x', width: 800, height: 600, bytes: 1234, format: 'jpg' }) }
  }
  cloudinary.uploader.destroy = async (id) => { destroyed = id; return { result: 'ok' } }
  try {
    assert.equal(storage.storageProvider(), 'cloudinary')
    const r = await storage.saveImage(PNG, { ownerId: 'u1', kind: 'listings' })
    assert.equal(r.provider, 'cloudinary')
    assert.match(r.url, /^https:\/\/res\.cloudinary\.com\//)
    assert.equal(opts.folder, 'campus-marketplace/listings')
    assert.equal(opts.transformation[0].crop, 'limit')
    assert.ok(await storage.removeImage({ publicId: r.publicId, provider: 'cloudinary' }))
    assert.equal(destroyed, 'campus-marketplace/listings/x')
  } finally {
    cloudinary.uploader.upload_stream = origStream
    cloudinary.uploader.destroy = origDestroy
    process.env.STORAGE_PROVIDER = 'local'
    delete process.env.CLOUDINARY_CLOUD_NAME
    delete process.env.CLOUDINARY_API_KEY
    delete process.env.CLOUDINARY_API_SECRET
    void saved
  }
})

// ───────────────────────────── payments ─────────────────────────────

async function freshSale(token = otherToken, over = {}) {
  const r = await api('/listings', { method: 'POST', token, body: newListing(over) })
  assert.equal(r.status, 201, r.data.error)
  return r.data
}
async function pay(token, listingId) {
  const order = await api('/payments/create-order', { method: 'POST', token, body: { listingId } })
  if (order.status !== 201) return { order }
  const signed = await api('/payments/dev-complete', { method: 'POST', token, body: { orderId: order.data.orderId, outcome: 'success' } })
  const verify = await api('/payments/verify', { method: 'POST', token, body: signed.data })
  return { order, verify }
}

test('payment amount comes from the listing, never from the client', async () => {
  const l = await freshSale(otherToken, { price: 300, askingPrice: 300 })
  const order = await api('/payments/create-order', { method: 'POST', token: riyaToken, body: { listingId: l.id, amount: 1 } })
  assert.equal(order.status, 201)
  assert.equal(order.data.amount, 300)
  const row = await Payment.findOne({ orderId: order.data.orderId })
  assert.equal(row.amount, 300)
})

test('cannot buy your own listing', async () => {
  const l = await freshSale(riyaToken)
  const r = await api('/payments/create-order', { method: 'POST', token: riyaToken, body: { listingId: l.id } })
  assert.equal(r.status, 400)
})

test('checkout reserves the item; failure/cancel releases it; expiry releases it', async () => {
  const l = await freshSale(otherToken)
  const first = await api('/payments/create-order', { method: 'POST', token: riyaToken, body: { listingId: l.id } })
  assert.equal(first.status, 201)
  assert.equal((await Listing.findById(l.id)).status, 'reserved')

  // a second student cannot start checkout, and the item disappears from the feed
  const [admin] = [await User.findOne({ email: 'admin@campus.edu' })]
  void admin
  const third = await User.findOne({ isSeed: true, role: 'student', email: { $nin: ['riya.sharma@campus.edu', other.email] } })
  const thirdToken = await login(third.email)
  const blocked = await api('/payments/create-order', { method: 'POST', token: thirdToken, body: { listingId: l.id } })
  assert.equal(blocked.status, 409)
  const feed = (await api('/listings?type=buy', { token: thirdToken })).data
  assert.ok(!feed.some((x) => x.id === l.id))

  // buyer cancels -> item is back on sale
  const cancel = await api('/payments/verify', { method: 'POST', token: riyaToken, body: { orderId: first.data.orderId, status: 'cancelled' } })
  assert.equal(cancel.status, 200)
  assert.equal((await Listing.findById(l.id)).status, 'active')

  // abandoned checkout expires
  const again = await api('/payments/create-order', { method: 'POST', token: thirdToken, body: { listingId: l.id } })
  assert.equal(again.status, 201)
  await Listing.updateOne({ _id: l.id }, { $set: { reservedUntil: new Date(Date.now() - 1000) } })
  assert.ok((await releaseExpiredReservations()) >= 1)
  assert.equal((await Listing.findById(l.id)).status, 'active')
  assert.equal((await Payment.findOne({ orderId: again.data.orderId })).status, 'cancelled')
})

test('successful payment marks sold, notifies both sides and lists in /payments', async () => {
  const l = await freshSale(otherToken)
  const { verify } = await pay(riyaToken, l.id)
  assert.equal(verify.status, 200)
  assert.equal(verify.data.payment.signature, undefined)
  assert.equal((await Listing.findById(l.id)).status, 'sold')

  const buyer = (await api('/payments', { token: riyaToken })).data.find((p) => p.listingId === l.id)
  assert.equal(buyer.role, 'buyer')
  assert.equal(buyer.status, 'paid')
  const seller = (await api('/payments', { token: otherToken })).data.find((p) => p.listingId === l.id)
  assert.equal(seller.role, 'seller')
  const sellerNotes = (await api('/notifications', { token: otherToken })).data
  assert.ok(sellerNotes.some((n) => /was bought/i.test(n.title)))

  // double verify is idempotent
  const dup = await api('/payments/verify', { method: 'POST', token: riyaToken, body: { orderId: buyer.orderId, paymentId: 'x', signature: 'y' } })
  assert.equal(dup.status, 200)
  assert.equal(dup.data.duplicate, true)
})

test('razorpay webhook: bad signature rejected, captured event finalizes payment even if browser never returns', async () => {
  const l = await freshSale(otherToken)
  const order = await api('/payments/create-order', { method: 'POST', token: riyaToken, body: { listingId: l.id } })
  const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_web1', order_id: order.data.orderId } } } })
  const send = (sig) => fetch(`${base}/api/payments/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sig }, body: payload })
  assert.equal((await send('deadbeef')).status, 400)
  assert.equal((await Listing.findById(l.id)).status, 'reserved')
  const good = crypto.createHmac('sha256', 'whsec_test').update(payload).digest('hex')
  assert.equal((await send(good)).status, 200)
  assert.equal((await Listing.findById(l.id)).status, 'sold')
  assert.equal((await Payment.findOne({ orderId: order.data.orderId })).status, 'paid')
})

test('late payment for an item that was resold is refunded automatically', async () => {
  const l = await freshSale(otherToken)
  const order = await api('/payments/create-order', { method: 'POST', token: riyaToken, body: { listingId: l.id } })
  await Listing.updateOne({ _id: l.id }, { $set: { status: 'sold', reservedBy: null } }) // someone else got it
  const signed = await api('/payments/dev-complete', { method: 'POST', token: riyaToken, body: { orderId: order.data.orderId, outcome: 'success' } })
  const verify = await api('/payments/verify', { method: 'POST', token: riyaToken, body: signed.data })
  assert.equal(verify.status, 409)
  assert.equal(verify.data.refunded, true)
  assert.equal((await Payment.findOne({ orderId: order.data.orderId })).status, 'refunded')
})

test('only admins can refund; refund puts the item back on sale', async () => {
  const l = await freshSale(otherToken)
  const { verify } = await pay(riyaToken, l.id)
  const id = verify.data.payment.id
  assert.equal((await api(`/payments/${id}/refund`, { method: 'POST', token: riyaToken, body: {} })).status, 403)
  const ok = await api(`/payments/${id}/refund`, { method: 'POST', token: adminToken, body: { reason: 'test' } })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.payment.status, 'refunded')
  assert.equal((await Listing.findById(l.id)).status, 'active')
})

// ───────────────────────────── optional location sharing ─────────────────────────────

const CAMPUS = { lat: 30.3560, lon: 76.3640 }

test('fuzzPoint blurs 80-220 m, deterministically', () => {
  for (const key of ['a', 'b', 'c', '65f0c0ffee']) {
    const p = fuzzPoint(CAMPUS.lat, CAMPUS.lon, key)
    const m = haversineKm(CAMPUS.lat, CAMPUS.lon, p.lat, p.lon) * 1000
    assert.ok(m >= 75 && m <= 225, `${m}`)
    assert.deepEqual(p, fuzzPoint(CAMPUS.lat, CAMPUS.lon, key))
  }
})

test('listing location is opt-in, blurred in storage and never exposed as coordinates', async () => {
  // seed students may already have a stored profile location; clear it so we test the "nothing available" path
  await api('/location/preferences', { method: 'PUT', token: otherToken, body: { enabled: false } })
  const none = await api('/listings', { method: 'POST', token: otherToken, body: newListing({ shareLocation: true }) })
  assert.equal(none.status, 201)
  assert.equal(none.data.locationShared, false)
  assert.match(none.data.locationNote, /not shared/i)

  const off = await api('/listings', { method: 'POST', token: otherToken, body: newListing() })
  assert.equal(off.data.locationShared, false)

  const on = await api('/listings', { method: 'POST', token: otherToken, body: newListing({ shareLocation: true, ...CAMPUS }) })
  assert.equal(on.status, 201)
  assert.equal(on.data.locationShared, true)
  assert.ok(!/coordinates|"geo"/.test(JSON.stringify(on.data)))
  const stored = await Listing.findById(on.data.id)
  const [lon, lat] = stored.geo.coordinates
  const metres = haversineKm(CAMPUS.lat, CAMPUS.lon, lat, lon) * 1000
  assert.ok(metres > 50, 'stored point should be blurred, not the exact doorstep')
  assert.notEqual(lat, CAMPUS.lat)
})

test('nearby search needs viewer opt-in, respects radius and other filters, and sellers can switch sharing off', async () => {
  const l = await api('/listings', { method: 'POST', token: otherToken, body: newListing({ category: 'cycles', shareLocation: true, ...CAMPUS }) })
  assert.equal(l.data.locationShared, true)

  const denied = await api('/listings?nearby=true', { token: riyaToken })
  assert.equal(denied.status, 400)

  await api('/location/preferences', { method: 'PUT', token: riyaToken, body: { enabled: true } })
  // viewer is ~2.2 km away
  await api('/location', { method: 'PUT', token: riyaToken, body: { lat: CAMPUS.lat + 0.02, lon: CAMPUS.lon } })

  const within = await api('/listings?nearby=true&radiusKm=5&category=cycles&type=buy', { token: riyaToken })
  assert.equal(within.status, 200, within.data.error)
  const hit = within.data.find((x) => x.id === l.data.id)
  assert.ok(hit, 'listing should be found within 5 km')
  assert.match(hit.distanceLabel, /^~\d+(\.\d)? km away$/)
  assert.ok(hit.distanceKm > 1.5 && hit.distanceKm < 3)
  assert.ok(!/coordinates/.test(JSON.stringify(within.data)))
  assert.ok(within.data.every((x) => x.category === 'cycles'), 'category filter must compose with nearby')

  const tooSmall = await api('/listings?nearby=true&radiusKm=1&category=cycles', { token: riyaToken })
  assert.ok(!tooSmall.data.some((x) => x.id === l.data.id))

  const nearbyRoute = await api('/location/nearby?radiusKm=5', { token: riyaToken })
  assert.ok(nearbyRoute.data.some((x) => x.id === l.data.id))

  // only the owner may change it
  const bad = await api(`/listings/${l.data.id}/location`, { method: 'PUT', token: riyaToken, body: { share: false } })
  assert.equal(bad.status, 403)
  const stop = await api(`/listings/${l.data.id}/location`, { method: 'PUT', token: otherToken, body: { share: false } })
  assert.equal(stop.status, 200)
  assert.equal(stop.data.locationShared, false)
  const after = await api('/listings?nearby=true&radiusKm=5&category=cycles', { token: riyaToken })
  assert.ok(!after.data.some((x) => x.id === l.data.id))

  // turning on again needs valid coordinates
  assert.equal((await api(`/listings/${l.data.id}/location`, { method: 'PUT', token: otherToken, body: { share: true } })).status, 400)
  assert.equal((await api(`/listings/${l.data.id}/location`, { method: 'PUT', token: otherToken, body: { share: true, ...CAMPUS } })).data.locationShared, true)

  // disabling my own discovery wipes my stored point; later nearby calls fail
  await api('/location/preferences', { method: 'PUT', token: riyaToken, body: { enabled: false } })
  assert.equal((await api('/listings?nearby=true', { token: riyaToken })).status, 400)
})

// ───────────────────────────── price recommendation ─────────────────────────────

const priceBody = { category: 'books', brand: 'Wiley', title: 'Engineering Mathematics', originalPrice: 650, ageMonths: 8, condition: 'Like New', listingType: 'sale' }

test('model answer is passed through untouched (no 65/35 blending)', async () => {
  mlMode = 'ok'
  const r = await api('/ai/price-predict', { method: 'POST', token: riyaToken, body: priceBody })
  assert.equal(r.status, 200)
  assert.equal(r.data.source, 'ml')
  assert.equal(r.data.recommendedPrice, 500)
  assert.equal(r.data.minFairPrice, 400)
  assert.equal(r.data.maxFairPrice, 640)
  assert.equal(r.data.explanation, 'stub model')
})

test('when the ML service is down the formula fallback is used and labelled', async () => {
  mlMode = 'down'
  const r = await api('/ai/price-predict', { method: 'POST', token: riyaToken, body: priceBody })
  assert.equal(r.status, 200)
  assert.equal(r.data.source, 'heuristic')
  assert.ok(r.data.recommendedPrice > 100 && r.data.recommendedPrice < 650)
  mlMode = 'ok'
})

test('publishing stores the model recommendation and band on the listing', async () => {
  mlMode = 'ok'
  const l = await api('/listings', { method: 'POST', token: otherToken, body: newListing({ ...priceBody, price: 480, askingPrice: 480 }) })
  assert.equal(l.status, 201)
  assert.equal(l.data.recommendedPrice, 500)
  assert.equal(l.data.fairMin, 400)
  assert.equal(l.data.fairMax, 640)
  assert.equal(l.data.aiSource, 'ml')
})

test('price comparables appear only with enough similar listings', async () => {
  for (let i = 0; i < 4; i += 1) await api('/listings', { method: 'POST', token: otherToken, body: newListing({ category: 'lab', condition: 'Fair', price: 100 + i * 10, askingPrice: 100 + i * 10 }) })
  const r = await api('/ai/price-predict', { method: 'POST', token: riyaToken, body: { ...priceBody, category: 'lab', condition: 'Fair' } })
  assert.ok(r.data.comparables, 'expected comparables')
  assert.ok(r.data.comparables.count >= 4)
  const none = await api('/ai/price-predict', { method: 'POST', token: riyaToken, body: { ...priceBody, category: 'hostel', condition: 'New' } })
  assert.ok(none.data.comparables === null || none.data.comparables.count >= 4)
})
