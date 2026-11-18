// Fraud detection, decision engine, reports, admin tools, price-drop alerts, trust audit.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-fraud-'))
process.env.USE_MEMORY_DB = process.env.USE_MEMORY_DB || 'true'
process.env.JWT_SECRET = 'test-jwt'
process.env.OTP_PEPPER = 'test-otp'
process.env.DEV_RETURN_OTP = 'true'
process.env.ALLOWED_COLLEGE_DOMAINS = 'campus.edu,thapar.edu'
process.env.PAYMENT_DEV_SECRET = 'pay-test'
process.env.PAYMENT_MODE = 'dev'
process.env.SEED_PASSWORD = 'CampusDemo123!'
process.env.SEED_ADMIN_PASSWORD = 'CampusAdmin123!'
process.env.LOCAL_UPLOAD_DIR = uploadDir
process.env.STORAGE_PROVIDER = 'local'
delete process.env.CLOUDINARY_URL

// Stand-in for the FastAPI service. Fraud rule for the stub: contact details -> HIGH, urgency words -> MEDIUM.
let mlDown = false
let lastFraudPayload = null
const ml = createServer((req, res) => {
  if (mlDown) {
    res.statusCode = 503
    return res.end('{"detail":"down"}')
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/ai/price-predict') {
      return res.end(JSON.stringify({ recommendedPrice: 300, minFairPrice: 250, maxFairPrice: 350, confidence: 80, explanation: 'stub', source: 'ml' }))
    }
    if (req.url === '/ai/fraud-score') {
      const p = JSON.parse(body || '{}')
      lastFraudPayload = p
      const [score, level, decision] = p.contactInDescription >= 1 ? [0.86, 'HIGH', 'HOLD'] : p.urgencyScore >= 1 ? [0.52, 'MEDIUM', 'VERIFY'] : [0.08, 'LOW', 'PUBLISH']
      return res.end(
        JSON.stringify({
          fraudRiskScore: score,
          fraudRiskLevel: level,
          decision,
          decisionText: decision,
          fraudSignals: level === 'LOW' ? ['no_strong_anomaly'] : ['stub_signal'],
          reasons: level === 'LOW' ? [] : [{ feature: 'contact_in_description', level: 'listing', text: 'contact text', impact: 0.3 }],
          anomalyScore: score,
          source: 'ml',
        })
      )
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
const Notification = (await import('../models/Notification.js')).default
const AuditLog = (await import('../models/AuditLog.js')).default
const Message = (await import('../models/Message.js')).default
const { computeTrust } = await import('../utils/trust.js')
const { shouldAlert } = await import('../utils/priceAlerts.js')
const { encryptLocation, decryptLocation } = await import('../utils/locationCrypto.js')

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
async function login(email, password = 'CampusDemo123!', headers = {}) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password }, headers })
  assert.equal(r.status, 200, r.data.error)
  return r.data.token
}
const newListing = (over = {}) => ({
  title: `Fraud test item ${crypto.randomBytes(3).toString('hex')}`,
  category: 'books',
  condition: 'Good',
  originalPrice: 500,
  price: 300,
  askingPrice: 300,
  ageMonths: 6,
  listingType: 'sell',
  description: `Clean copy, no markings ${crypto.randomBytes(4).toString('hex')}`,
  ...over,
})

const students = await User.find({ isSeed: true, role: 'student', email: { $ne: 'riya.sharma@campus.edu' } }).sort({ email: 1 }).limit(8)
const riyaToken = await login('riya.sharma@campus.edu')
const riya = (await api('/auth/me', { token: riyaToken })).data
const adminToken = await login('admin@campus.edu', 'CampusAdmin123!')
const tokens = []
for (const s of students) tokens.push(await login(s.email))
const [sellerTok, s2Tok, s3Tok, s4Tok] = tokens

// ───────────────────────────── combined decision engine ─────────────────────────────

test('LOW risk publishes immediately and internal fraud features are never exposed', async () => {
  const r = await api('/listings', { method: 'POST', token: sellerTok, body: newListing() })
  assert.equal(r.status, 201, r.data.error)
  assert.equal(r.data.status, 'active')
  assert.equal(r.data.fraudRiskLevel, 'LOW')
  assert.equal(r.data.fraudFeatures, undefined)
  assert.equal(r.data.verifyOtpHash, undefined)
  // the model received listing, user and behavioural features, including the AI fair price
  for (const k of ['fairPrice', 'reusedImageCount', 'linkedAccounts', 'messages1h', 'listings24h', 'openReports', 'trustScore']) {
    assert.ok(k in lastFraudPayload, `missing feature ${k}`)
  }
  assert.equal(lastFraudPayload.fairPrice, 300)
  const stored = await Listing.findById(r.data.id).lean()
  assert.ok(stored.fraudFeatures, 'feature snapshot stored for future supervised training')
})

test('MEDIUM risk -> extra verification (email OTP) before the listing goes public', async () => {
  const r = await api('/listings', { method: 'POST', token: sellerTok, body: newListing({ description: 'Urgent sale, leaving tomorrow. Good condition overall.' }) })
  assert.equal(r.status, 201)
  assert.equal(r.data.status, 'verification')
  assert.equal(r.data.fraudAction, 'VERIFY')
  assert.match(r.data.devOtp, /^\d{6}$/)
  const id = r.data.id

  const browse = await api('/listings', { token: riyaToken })
  assert.ok(!browse.data.some((l) => l.id === id), 'unverified listing must not be public')
  assert.equal((await api(`/listings/${id}`, { token: riyaToken })).status, 404)
  assert.equal((await api(`/listings/${id}`, { token: sellerTok })).status, 200, 'owner can still see it')

  // owner cannot just flip it to active
  assert.equal((await api(`/listings/${id}`, { method: 'PUT', token: sellerTok, body: { status: 'active' } })).status, 400)
  assert.equal((await api(`/listings/${id}/verify`, { method: 'POST', token: riyaToken, body: { otp: r.data.devOtp } })).status, 403)
  assert.equal((await api(`/listings/${id}/verify`, { method: 'POST', token: sellerTok, body: { otp: '000000' } })).status, 400)

  const resend = await api(`/listings/${id}/verify/resend`, { method: 'POST', token: sellerTok })
  assert.equal(resend.status, 200)
  const ok = await api(`/listings/${id}/verify`, { method: 'POST', token: sellerTok, body: { otp: resend.data.devOtp } })
  assert.equal(ok.status, 200, ok.data.error)
  assert.equal(ok.data.status, 'active')
  assert.equal(ok.data.fraudDecision, 'verified')
})

test('HIGH risk -> held for admin review; only admins decide; decision is audited and notified', async () => {
  const r = await api('/listings', {
    method: 'POST',
    token: s2Tok,
    body: newListing({ description: 'Brand new, pay advance on whatsapp 9876543210 and I will courier it' }),
  })
  assert.equal(r.status, 201)
  assert.equal(r.data.status, 'held')
  assert.equal(r.data.fraudAction, 'HOLD')
  assert.ok(r.data.fraudReasons.length > 0)

  assert.equal((await api('/admin/fraud-alerts', { token: riyaToken })).status, 403)
  const queue = await api('/admin/fraud-alerts', { token: adminToken })
  const item = queue.data.find((m) => String(m.listingId) === r.data.id)
  assert.ok(item, 'listing appears in the admin fraud queue')
  assert.equal(item.listingDoc.fraudRiskLevel, 'HIGH')
  assert.ok(item.reasons.length > 0, 'explanations shown to the admin')

  assert.equal((await api(`/admin/listings/${r.data.id}/review`, { method: 'PUT', token: riyaToken, body: { decision: 'approve' } })).status, 403)
  const rev = await api(`/admin/listings/${r.data.id}/review`, { method: 'PUT', token: adminToken, body: { decision: 'approve', note: 'Checked with seller' } })
  assert.equal(rev.status, 200)
  assert.equal(rev.data.status, 'active')
  assert.ok(await AuditLog.findOne({ action: 'listing_approved', targetListingId: r.data.id }))
  assert.ok(await Notification.findOne({ relatedId: r.data.id, title: 'Listing approved' }))
})

test('if the ML service is down the rule fallback still screens listings (and says so)', async () => {
  mlDown = true
  try {
    const r = await api('/listings', { method: 'POST', token: s3Tok, body: newListing() })
    assert.equal(r.status, 201)
    assert.equal(r.data.fraudSource, 'heuristic')
    assert.equal(r.data.status, 'active')
  } finally {
    mlDown = false
  }
})

test('photos reused from another seller are detected as a fraud feature', async () => {
  const up = async (tok) => {
    const fd = new FormData()
    fd.append('images', new Blob([PNG], { type: 'image/png' }), 'same.png')
    return api('/uploads/images', { method: 'POST', token: tok, raw: fd })
  }
  const a = await up(s3Tok)
  assert.equal(a.status, 201)
  await api('/listings', { method: 'POST', token: s3Tok, body: newListing({ images: [a.data.images[0].url] }) })
  const b = await up(s4Tok)
  await api('/listings', { method: 'POST', token: s4Tok, body: newListing({ images: [b.data.images[0].url] }) })
  assert.ok(lastFraudPayload.reusedImageCount >= 1, 'same photo bytes from a different seller')
})

test('accounts used from the same device are linked (duplicate-account detection)', async () => {
  const device = { 'X-Device-Id': 'device-test-1234567890' }
  await login(students[5].email, 'CampusDemo123!', device)
  const t = await login(students[6].email, 'CampusDemo123!', device)
  await api('/listings', { method: 'POST', token: t, body: newListing() })
  assert.ok(lastFraudPayload.linkedAccounts >= 1)
  const users = await api('/admin/users?q=' + encodeURIComponent(students[6].email), { token: adminToken })
  assert.ok(users.data[0].linkedAccounts >= 1)
  assert.equal(users.data[0].deviceHashes, undefined, 'device hashes never leave the server')
})

// ───────────────────────────── price-drop alerts ─────────────────────────────

test('price-drop rule and thresholds', () => {
  assert.equal(shouldAlert({ alertEnabled: true, lastObservedPrice: 100, thresholdType: 'any' }, 99), true)
  assert.equal(shouldAlert({ alertEnabled: true, lastObservedPrice: 100, thresholdType: 'any' }, 100), false)
  assert.equal(shouldAlert({ alertEnabled: true, lastObservedPrice: 100, thresholdType: 'percent', thresholdValue: 10 }, 95), false)
  assert.equal(shouldAlert({ alertEnabled: true, lastObservedPrice: 100, thresholdType: 'percent', thresholdValue: 10 }, 90), true)
  assert.equal(shouldAlert({ alertEnabled: true, lastObservedPrice: 1000, thresholdType: 'amount', thresholdValue: 200 }, 850), false)
  assert.equal(shouldAlert({ alertEnabled: false, lastObservedPrice: 100, thresholdType: 'any' }, 50), false)
})

test('watchers get an in-app alert when the seller lowers the price (respecting their threshold)', async () => {
  const l = await api('/listings', { method: 'POST', token: sellerTok, body: newListing({ price: 1000, askingPrice: 1000, originalPrice: 2000 }) })
  const id = l.data.id
  const w1 = await api('/watchlist', { method: 'POST', token: riyaToken, body: { listingId: id } })
  assert.equal(w1.data.lastObservedPrice, 1000)
  await api('/watchlist', { method: 'POST', token: s2Tok, body: { listingId: id, thresholdType: 'percent', thresholdValue: 20 } })
  assert.equal((await api(`/watchlist/${id}`, { method: 'PUT', token: s2Tok, body: { thresholdType: 'percent', thresholdValue: 200 } })).status, 400)

  const d1 = await api(`/listings/${id}`, { method: 'PUT', token: sellerTok, body: { price: 900 } })
  assert.equal(d1.data.priceDropAlertsSent, 1, 'only the "any drop" watcher is alerted at -10%')
  const riyaN = await Notification.find({ userId: riya.id, type: 'price_drop', relatedId: id })
  assert.equal(riyaN.length, 1)
  assert.match(riyaN[0].body, /1000 to ₹900/)

  const d2 = await api(`/listings/${id}`, { method: 'PUT', token: sellerTok, body: { price: 780 } })
  assert.equal(d2.data.priceDropAlertsSent, 2, 'cumulative drop of 22% now crosses the 20% threshold')
  const up = await api(`/listings/${id}`, { method: 'PUT', token: sellerTok, body: { price: 850 } })
  assert.equal(up.data.priceDropAlertsSent, 0)
})

// ───────────────────────────── reports & admin ─────────────────────────────

test('students report listings; 3 reports auto-hold; admin confirms -> trust drops and is audited', async () => {
  const l = await api('/listings', { method: 'POST', token: s4Tok, body: newListing() })
  const id = l.data.id
  const accused = await User.findById(l.data.seller.userId)
  const trustBefore = (await api(`/users/${accused._id}/trust-score`, { token: riyaToken })).data.trustScore

  assert.equal((await api('/reports', { method: 'POST', token: s4Tok, body: { listingId: id, reason: 'self report' } })).status, 400)
  const r1 = await api('/reports', { method: 'POST', token: riyaToken, body: { listingId: id, reason: 'Fake photos', category: 'fake_listing' } })
  assert.equal(r1.status, 201)
  assert.equal((await api('/reports', { method: 'POST', token: riyaToken, body: { listingId: id, reason: 'again' } })).status, 409)
  await api('/reports', { method: 'POST', token: sellerTok, body: { listingId: id, reason: 'Asked for advance', category: 'scam' } })
  const r3 = await api('/reports', { method: 'POST', token: s2Tok, body: { listingId: id, reason: 'Never showed up', category: 'no_show' } })
  assert.equal(r3.data.autoHeld, true)
  assert.equal((await Listing.findById(id)).status, 'held')

  const open = await api('/admin/reports?status=open', { token: adminToken })
  assert.ok(open.data.filter((x) => String(x.listing?._id) === id).length === 3)
  const conf = await api(`/admin/reports/${r1.data.id}`, { method: 'PUT', token: adminToken, body: { status: 'confirmed', note: 'Photos from the internet' } })
  assert.equal(conf.status, 200)
  assert.equal((await User.findById(accused._id)).confirmedReports, accused.confirmedReports + 1)
  const trust = await api(`/users/${accused._id}/trust-score`, { token: adminToken })
  assert.ok(trust.data.trustScore < trustBefore, 'confirmed report lowers trust')
  assert.ok(trust.data.history.length >= 1, 'trust changes are in the audit trail')
  assert.ok(await AuditLog.findOne({ action: 'report_confirmed', targetUserId: accused._id }))
})

test('chat abuse reporting: only the recipient can report a message', async () => {
  const sent = await api('/messages', { method: 'POST', token: sellerTok, body: { body: 'hello there', toUserId: riya.id } })
  assert.equal(sent.status, 201)
  const msg = await Message.findOne({ fromUserId: students[0]._id, toUserId: riya.id }).sort({ createdAt: -1 })
  assert.equal((await api('/reports', { method: 'POST', token: s2Tok, body: { targetType: 'message', messageId: msg._id, reason: 'spam' } })).status, 403)
  const ok = await api('/reports', { method: 'POST', token: riyaToken, body: { targetType: 'message', messageId: msg._id, reason: 'Abusive', category: 'harassment' } })
  assert.equal(ok.status, 201)
})

test('admin suspends a student: login blocked, listings hidden; unsuspend restores them', async () => {
  const target = students[7]
  const tok = await login(target.email)
  const l = await api('/listings', { method: 'POST', token: tok, body: newListing() })
  assert.equal((await api(`/admin/users/${target._id}/suspend`, { method: 'PUT', token: adminToken, body: { suspended: true } })).status, 400, 'reason required')
  const s = await api(`/admin/users/${target._id}/suspend`, { method: 'PUT', token: adminToken, body: { suspended: true, reason: 'Repeated scam reports' } })
  assert.equal(s.status, 200)
  assert.equal((await api('/auth/me', { token: tok })).status, 403, 'existing session is blocked')
  assert.equal((await api('/auth/login', { method: 'POST', body: { email: target.email, password: 'CampusDemo123!' } })).status, 403)
  assert.equal((await Listing.findById(l.data.id)).status, 'held')
  await api(`/admin/users/${target._id}/suspend`, { method: 'PUT', token: adminToken, body: { suspended: false } })
  assert.equal((await Listing.findById(l.data.id)).status, 'active')
  assert.ok(await AuditLog.findOne({ action: 'user_suspended', targetUserId: target._id }))
})

test('banned words and category management are enforced', async () => {
  assert.equal((await api('/listings', { method: 'POST', token: sellerTok, body: newListing({ title: 'Vape pen barely used' }) })).status, 400)
  const settings = await api('/admin/settings', { token: adminToken })
  assert.ok(settings.data.bannedWords.includes('vape'))
  await api('/admin/settings', { method: 'PUT', token: adminToken, body: { bannedWords: [...settings.data.bannedWords, 'hoverboard'] } })
  assert.equal((await api('/listings', { method: 'POST', token: sellerTok, body: newListing({ title: 'Hoverboard with charger' }) })).status, 400)
  assert.equal((await api('/messages', { method: 'POST', token: sellerTok, body: { body: 'want a hoverboard?', toUserId: riya.id } })).status, 400)

  const cats = settings.data.categories.map((c) => (c.id === 'lab' ? { ...c, enabled: false } : c))
  await api('/admin/settings', { method: 'PUT', token: adminToken, body: { categories: cats } })
  assert.ok(!(await api('/categories')).data.some((c) => c.id === 'lab'))
  assert.equal((await api('/listings', { method: 'POST', token: sellerTok, body: newListing({ category: 'lab' }) })).status, 400)
  await api('/admin/settings', { method: 'PUT', token: adminToken, body: { categories: settings.data.categories } })
  assert.ok((await api('/categories')).data.some((c) => c.id === 'lab'))
  assert.equal((await api('/admin/settings', { method: 'PUT', token: riyaToken, body: { bannedWords: [] } })).status, 403)
})

test('admin analytics and audit log are admin-only', async () => {
  assert.equal((await api('/admin/analytics', { token: riyaToken })).status, 403)
  const a = await api('/admin/analytics', { token: adminToken })
  assert.equal(a.status, 200)
  assert.ok(a.data.users.total > 10)
  assert.ok('HIGH' in a.data.listings.byFraudLevel)
  assert.ok(Array.isArray(a.data.overdueLoans))
  const audit = await api('/admin/audit', { token: adminToken })
  assert.ok(audit.data.length > 0)
})

// ───────────────────────────── trust score, avatar, location privacy ─────────────────────────────

test('trust score follows the PDF formula; confirmed reports hurt more than open complaints', () => {
  const base = { verified: true, avgRating: 4.5, reviewCount: 6, completed: 5, onTimeLoans: 3, overdueLoans: 0, accountAgeDays: 200, confirmedReports: 0, upheldFlags: 0, openReports: 0 }
  const clean = computeTrust(base).score
  const open = computeTrust({ ...base, openReports: 1 }).score
  const confirmed = computeTrust({ ...base, confirmedReports: 1 }).score
  assert.ok(clean >= 80, `established user should be highly trusted (got ${clean})`)
  assert.ok(confirmed < open && open < clean)
  assert.ok(computeTrust({ ...base, overdueLoans: 3, onTimeLoans: 0 }).score < clean, 'overdue history lowers trust')
  const newbie = computeTrust({ ...base, reviewCount: 0, avgRating: 0, completed: 0, onTimeLoans: 0, accountAgeDays: 1 }).score
  assert.ok(newbie >= 40 && newbie < 60, `new verified student = limited history (got ${newbie})`)
})

test('trust-score endpoint explains the score', async () => {
  const t = await api(`/users/${riya.id}/trust-score`, { token: riyaToken })
  assert.equal(t.status, 200)
  for (const k of ['V', 'R', 'C', 'O', 'A', 'F']) assert.ok(k in t.data.components)
  assert.ok(t.data.label)
  assert.ok(t.data.formula.includes('V'))
})

test('avatar builder config is validated and stored as small JSON', async () => {
  const r = await api('/users/me', {
    method: 'PUT',
    token: riyaToken,
    body: { avatarConfig: { face: 'round', hair: 'curly', skin: '#c68a5b', accessory: 'cap', outfit: 'evil<script>', bg: '#bae6fd' } },
  })
  assert.equal(r.status, 200)
  assert.equal(r.data.avatarConfig.hair, 'curly')
  assert.equal(r.data.avatarConfig.outfit, 'tshirt', 'unknown values fall back to a safe default')
})

test('exact user location is encrypted at rest', async () => {
  const enc = encryptLocation({ type: 'Point', coordinates: [76.36, 30.35] })
  assert.match(enc, /^v1:/)
  assert.deepEqual(decryptLocation(enc).coordinates, [76.36, 30.35])
  await api('/location/preferences', { method: 'PUT', token: riyaToken, body: { enabled: true } })
  await api('/location', { method: 'PUT', token: riyaToken, body: { lat: 30.35, lon: 76.36 } })
  const raw = await User.collection.findOne({ email: 'riya.sharma@campus.edu' })
  assert.equal(typeof raw.locationExact, 'string')
  assert.ok(!raw.locationExact.includes('76.36'))
  const doc = await User.findById(riya.id)
  assert.deepEqual(doc.locationExact.coordinates, [76.36, 30.35])
})
