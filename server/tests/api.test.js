import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

process.env.USE_MEMORY_DB = 'true'
process.env.DEV_RETURN_OTP = 'true'
process.env.JWT_SECRET = 'test-jwt'
process.env.OTP_PEPPER = 'test-otp'
process.env.ALLOWED_COLLEGE_DOMAINS = 'campus.edu,thapar.edu'
process.env.PAYMENT_DEV_SECRET = 'pay-test'
process.env.PAYMENT_MODE = 'dev'
process.env.SEED_PASSWORD = 'CampusDemo123!'
process.env.SEED_ADMIN_PASSWORD = 'CampusAdmin123!'

const { connectDB, disconnectDB } = await import('../db.js')
const { seedDatabase } = await import('../seed.js')
const { app } = await import('../index.js')
const User = (await import('../models/User.js')).default

await connectDB()
await seedDatabase({ clear: true })

const server = createServer(app)
await new Promise((resolve) => server.listen(0, resolve))
const { port } = server.address()
const base = `http://127.0.0.1:${port}/api`

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

async function login(email, password) {
  const { status, data } = await api('/auth/login', { method: 'POST', body: { email, password } })
  assert.equal(status, 200, data.error)
  return data
}

test('health', async () => {
  const { status, data } = await api('/health')
  assert.equal(status, 200)
  assert.equal(data.ok, true)
})

test('invalid college email rejected', async () => {
  const { status, data } = await api('/auth/register', {
    method: 'POST',
    body: { name: 'X', email: 'x@yahoo.com', password: 'password123' },
  })
  assert.equal(status, 400)
  assert.match(data.error, /Invalid college email/i)
})

test('Gmail password signup redirected to Google Sign-In', async () => {
  const { status, data } = await api('/auth/register', {
    method: 'POST',
    body: { name: 'G', email: 'someone@gmail.com', password: 'password123' },
  })
  assert.equal(status, 400)
  assert.match(data.error, /Google/i)
})

test('Google Sign-In rejects missing token', async () => {
  const { status, data } = await api('/auth/google', { method: 'POST', body: {} })
  assert.ok([400, 503].includes(status), data.error)
})

test('Google OAuth start requires credentials', async () => {
  const res = await fetch(`${base}/auth/google/start`, { redirect: 'manual' })
  assert.ok([302, 503].includes(res.status))
})

test('register + OTP + login', async () => {
  const email = 'fresh.student@thapar.edu'
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Fresh Student', email, password: 'password123' },
  })
  assert.equal(reg.status, 201)
  assert.equal(reg.data.verificationStatus, 'pending')
  assert.ok(reg.data.devOtp)

  const listingsNoAuth = await api('/listings')
  assert.equal(listingsNoAuth.status, 401)

  const loginPending = await api('/auth/login', { method: 'POST', body: { email, password: 'password123' } })
  assert.equal(loginPending.status, 403)

  const badOtp = await api('/auth/verify', { method: 'POST', body: { email, otp: '000000' } })
  assert.equal(badOtp.status, 400)

  const verify = await api('/auth/verify', { method: 'POST', body: { email, otp: reg.data.devOtp } })
  assert.equal(verify.status, 200)
  assert.equal(verify.data.verificationStatus, 'verified')
  assert.ok(verify.data.token)
})

test('OTP expiry', async () => {
  const email = 'expire.student@campus.edu'
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { name: 'Expire Student', email, password: 'password123' },
  })
  const user = await User.findOne({ email }).select('+otpHash +otpExpiresAt')
  user.otpExpiresAt = new Date(Date.now() - 1000)
  await user.save()
  const verify = await api('/auth/verify', { method: 'POST', body: { email, otp: reg.data.devOtp } })
  assert.equal(verify.status, 400)
  assert.match(verify.data.error, /expired/i)
})

test('listings CRUD and search as verified student', async () => {
  const { token } = await login('riya.sharma@campus.edu', 'CampusDemo123!')
  const list = await api('/listings', { token })
  assert.equal(list.status, 200)
  assert.ok(list.data.length > 10)

  const search = await api('/listings?search=Calculator', { token })
  assert.equal(search.status, 200)

  const created = await api('/listings', {
    method: 'POST',
    token,
    body: {
      title: 'Graphing notebook',
      category: 'notes',
      condition: 'Good',
      originalPrice: 200,
      price: 120,
      askingPrice: 120,
      brand: 'Classmate',
      ageMonths: 6,
      listingType: 'sell',
      description: 'Used for one semester.',
    },
  })
  assert.equal(created.status, 201)
  const id = created.data.id
  const one = await api(`/listings/${id}`, { token })
  assert.equal(one.status, 200)
  assert.equal(one.data.title, 'Graphing notebook')
  assert.equal(one.data.geo, undefined)
  assert.ok(!JSON.stringify(one.data).includes('"coordinates"'))

  const updated = await api(`/listings/${id}`, { method: 'PUT', token, body: { price: 110 } })
  assert.equal(updated.status, 200)
  assert.equal(updated.data.price, 110)

  const other = await login('admin@campus.edu', 'CampusAdmin123!')
  // student cannot hit admin
  const studentAdmin = await api('/admin/fraud-alerts', { token })
  assert.equal(studentAdmin.status, 403)

  const alerts = await api('/admin/fraud-alerts', { token: other.token })
  assert.equal(alerts.status, 200)

  const del = await api(`/listings/${id}`, { method: 'DELETE', token })
  assert.equal(del.status, 200)
})

test('owner-only listing modification', async () => {
  const riya = await login('riya.sharma@campus.edu', 'CampusDemo123!')
  const mine = await api('/listings/mine', { token: riya.token })
  const listing = (await api('/listings', { token: riya.token })).data.find((l) => String(l.seller?.name) !== 'Riya Sharma')
  assert.ok(listing)
  const otherUser = await User.findOne({ email: { $ne: 'riya.sharma@campus.edu' }, role: 'student', verified: true })
  // login as a seeded student
  const peer = await login(otherUser.email, 'CampusDemo123!')
  const riyaListing = mine.data[0]
  const denied = await api(`/listings/${riyaListing.id}`, { method: 'PUT', token: peer.token, body: { price: 1 } })
  assert.equal(denied.status, 403)
})

test('location opt-in nearby and no exact coords', async () => {
  const { token } = await login('riya.sharma@campus.edu', 'CampusDemo123!')
  const off = await api('/location/nearby', { token })
  assert.equal(off.status, 400)
  const pref = await api('/location/preferences', { method: 'PUT', token, body: { enabled: true } })
  assert.equal(pref.status, 200)
  const set = await api('/location', { method: 'PUT', token, body: { lat: 30.356, lon: 76.364 } })
  assert.equal(set.status, 200)
  assert.equal(set.data.locationExact, undefined)
  const nearby = await api('/location/nearby', { token })
  assert.ok([200, 400].includes(nearby.status))
  if (nearby.status === 200) {
    const blob = JSON.stringify(nearby.data)
    assert.equal(blob.includes('coordinates'), false)
  }
  const disable = await api('/location/preferences', { method: 'PUT', token, body: { enabled: false } })
  assert.equal(disable.status, 200)
})

test('borrow/lend workflow', async () => {
  const riya = await login('riya.sharma@campus.edu', 'CampusDemo123!')
  const me = await api('/auth/me', { token: riya.token })
  const listings = (await api('/listings?type=lend', { token: riya.token })).data
  const lend = listings.find((l) => String(l.seller?.userId) !== String(me.data.id))
  assert.ok(lend)
  const req = await api('/transactions', { method: 'POST', token: riya.token, body: { listingId: lend.id, type: 'borrow', dueDays: 5 } })
  assert.equal(req.status, 201)
  assert.equal(req.data.status, 'REQUESTED')
  const lender = await User.findById(lend.seller.userId)
  const lenderLogin = await login(lender.email, 'CampusDemo123!')
  const approved = await api(`/transactions/${req.data.id}/approve`, { method: 'POST', token: lenderLogin.token })
  assert.equal(approved.status, 200)
  const due = await api(`/transactions/${req.data.id}/due-date`, {
    method: 'PUT',
    token: lenderLogin.token,
    body: { dueDate: new Date(Date.now() + 4 * 86400000).toISOString() },
  })
  assert.equal(due.status, 200)
  const ext = await api(`/transactions/${req.data.id}/extend`, { method: 'POST', token: riya.token, body: { days: 3 } })
  assert.equal(ext.status, 200)
  const extOk = await api(`/transactions/${req.data.id}/extend`, { method: 'POST', token: lenderLogin.token, body: { approve: true } })
  assert.equal(extOk.status, 200)
  const ret = await api(`/transactions/${req.data.id}/return`, { method: 'PUT', token: riya.token })
  assert.equal(ret.status, 200)
  assert.equal(ret.data.status, 'RETURN_REQUESTED')
  const done = await api(`/transactions/${req.data.id}/return`, { method: 'PUT', token: lenderLogin.token })
  assert.equal(done.status, 200)
  assert.equal(done.data.status, 'COMPLETED')
})

test('payments create/verify/invalid signature', async () => {
  const { token } = await login('riya.sharma@campus.edu', 'CampusDemo123!')
  const listings = (await api('/listings?type=buy', { token })).data
  const sale = listings.find((l) => l.status === 'active')
  const order = await api('/payments/create-order', { method: 'POST', token, body: { listingId: sale.id } })
  assert.equal(order.status, 201)
  const bad = await api('/payments/verify', {
    method: 'POST',
    token,
    body: { orderId: order.data.orderId, paymentId: 'x', signature: 'nope' },
  })
  assert.equal(bad.status, 400)
  const retry = await api('/payments/create-order', { method: 'POST', token, body: { listingId: sale.id } })
  const signed = await api('/payments/dev-complete', { method: 'POST', token, body: { orderId: retry.data.orderId, outcome: 'success' } })
  const ok = await api('/payments/verify', { method: 'POST', token, body: signed.data })
  assert.equal(ok.status, 200)
  const soldAgain = await api('/payments/create-order', { method: 'POST', token, body: { listingId: sale.id } })
  assert.equal(soldAgain.status, 400)

  const otherSale = listings.find((l) => l.id !== sale.id && l.status === 'active')
  assert.ok(otherSale)
  const failOrder = await api('/payments/create-order', { method: 'POST', token, body: { listingId: otherSale.id } })
  const failSigned = await api('/payments/dev-complete', { method: 'POST', token, body: { orderId: failOrder.data.orderId, outcome: 'failed' } })
  const failed = await api('/payments/verify', { method: 'POST', token, body: { ...failSigned.data, status: 'failed' } })
  assert.ok([200].includes(failed.status))
})

test('AI price and fraud endpoints do not crash the API', async () => {
  const { token } = await login('riya.sharma@campus.edu', 'CampusDemo123!')
  const price = await api('/ai/price-predict', {
    method: 'POST',
    token,
    body: {
      category: 'electronics',
      brand: 'Casio',
      originalPrice: 1295,
      ageMonths: 8,
      condition: 'Good',
      listingType: 'sale',
    },
  })
  assert.equal(price.status, 200)
  assert.ok(price.data.recommendedPrice > 200)
  assert.ok(price.data.recommendedPrice < 1295)
  assert.ok(price.data.minFairPrice > 0)
  assert.ok(price.data.minFairPrice <= price.data.maxFairPrice)

  const lendPrice = await api('/ai/price-predict', {
    method: 'POST',
    token,
    body: {
      category: 'electronics',
      brand: 'Casio',
      originalPrice: 1295,
      ageMonths: 8,
      condition: 'Good',
      listingType: 'lend',
      lendUnit: 'day',
    },
  })
  assert.equal(lendPrice.status, 200)
  assert.ok(lendPrice.data.recommendedPrice >= 15)
  assert.ok(lendPrice.data.recommendedPrice < price.data.recommendedPrice)

  const fraud = await api('/ai/fraud-score', {
    method: 'POST',
    token,
    body: { title: 'Casio fx-991ES Plus', price: 700, originalPrice: 1295, description: 'Working calculator' },
  })
  assert.equal(fraud.status, 200)
  assert.ok(fraud.data.fraudRiskScore >= 0 && fraud.data.fraudRiskScore <= 1)
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(fraud.data.fraudRiskLevel))
})

test('trust score endpoint', async () => {
  const { token, user } = await login('riya.sharma@campus.edu', 'CampusDemo123!')
  const res = await api(`/users/${user.id}/trust-score`, { token })
  assert.equal(res.status, 200)
  assert.ok(res.data.trustScore >= 0)
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await disconnectDB()
})
