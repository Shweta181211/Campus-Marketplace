import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { connectDB, disconnectDB } from './db.js'
import User from './models/User.js'
import Listing from './models/Listing.js'
import Message from './models/Message.js'
import Transaction from './models/Transaction.js'
import Review from './models/Review.js'
import Moderation from './models/Moderation.js'
import Notification from './models/Notification.js'
import Watchlist from './models/Watchlist.js'
import Payment from './models/Payment.js'
import FraudReport from './models/FraudReport.js'
import { encodeGeohash } from './utils/geohash.js'
import { hashText } from './utils/ai.js'

const AVATARS = ['🐨', '🦊', '🐢', '🦉', '🐝', '🐙', '🦩', '🐿️', '🐼', '🐸']
const HOSTELS = ['Hostel A', 'Hostel B', 'Hostel C', 'Hostel D', 'Block A', 'Block C']
const CONDITIONS = ['New', 'Like New', 'Good', 'Fair']
const CATEGORY_META = {
  books: { iconKey: 'books', tape: 'yellow', bg: 'yellow' },
  cycles: { iconKey: 'cycles', tape: 'sky', bg: 'sky' },
  electronics: { iconKey: 'electronics', tape: 'coral', bg: 'coral' },
  lab: { iconKey: 'lab', tape: 'moss', bg: 'moss' },
  furniture: { iconKey: 'furniture', tape: 'yellow', bg: 'yellow' },
  hostel: { iconKey: 'hostel', tape: 'sky', bg: 'sky' },
  notes: { iconKey: 'notes', tape: 'coral', bg: 'coral' },
  other: { iconKey: 'other', tape: 'moss', bg: 'moss' },
}

const CAMPUS = { lat: 30.356, lon: 76.364 }

function jitter(i) {
  return {
    lat: CAMPUS.lat + ((i % 9) - 4) * 0.004,
    lon: CAMPUS.lon + ((Math.floor(i / 3) % 9) - 4) * 0.004,
  }
}

function sellerSnap(user) {
  return {
    name: user.name,
    trust: user.trust,
    trustScore: user.trustScore,
    avatar: user.avatar,
    verified: user.verified,
    userId: user._id,
  }
}

const FIRST = [
  'Aarav', 'Aditi', 'Ananya', 'Devansh', 'Farhan', 'Ishaan', 'Karan', 'Meera',
  'Neha', 'Priya', 'Rohan', 'Riya', 'Simran', 'Yash', 'Kabir', 'Diya',
  'Harsh', 'Isha', 'Jai', 'Lavanya', 'Mohit', 'Naina', 'Om', 'Pooja',
  'Raghav', 'Sana', 'Tanvi', 'Uday', 'Vivaan', 'Zara',
]
const LAST = ['Sharma', 'Rao', 'Mehta', 'Nair', 'Suri', 'Iyer', 'Kapoor', 'Bose', 'Kaur', 'Malhotra', 'Verma', 'Ali']

const LISTING_TEMPLATES = [
  { title: 'Engineering Mathematics Textbook', category: 'books', brand: 'Pearson', original: 650, age: 14, type: 'buy' },
  { title: 'Physics for Engineers', category: 'books', brand: 'McGraw Hill', original: 720, age: 20, type: 'buy' },
  { title: 'Data Structures in C', category: 'books', brand: 'Classic', original: 480, age: 10, type: 'buy' },
  { title: 'Mountain Bike Firefox', category: 'cycles', brand: 'Firefox', original: 12000, age: 24, type: 'buy' },
  { title: 'Hero Sprint Hybrid Cycle', category: 'cycles', brand: 'Hero', original: 9000, age: 18, type: 'buy' },
  { title: 'Casio fx-991ES Plus', category: 'electronics', brand: 'Casio', original: 1295, age: 8, type: 'buy' },
  { title: 'Arduino Uno Starter Kit', category: 'electronics', brand: 'Arduino', original: 1800, age: 6, type: 'lend' },
  { title: 'Used Dell Laptop i5', category: 'electronics', brand: 'Dell', original: 45000, age: 36, type: 'buy' },
  { title: 'Bluetooth Earphones', category: 'electronics', brand: 'boat', original: 1499, age: 9, type: 'buy' },
  { title: 'Mini Fridge 45L', category: 'hostel', brand: 'Croma', original: 7000, age: 20, type: 'lend' },
  { title: 'Electric Kettle 1L', category: 'hostel', brand: 'Pigeon', original: 900, age: 12, type: 'lend' },
  { title: 'Winter Hostel Jacket', category: 'hostel', brand: 'Decathlon', original: 1800, age: 16, type: 'buy' },
  { title: 'Study Table foldable', category: 'furniture', brand: 'Local', original: 2200, age: 18, type: 'buy' },
  { title: 'Desk Lamp LED', category: 'furniture', brand: 'Philips', original: 799, age: 7, type: 'lend' },
  { title: 'Mattress single', category: 'furniture', brand: 'Sleepwell', original: 3500, age: 24, type: 'buy' },
  { title: 'Lab Coat size M', category: 'lab', brand: 'Generic', original: 450, age: 3, type: 'buy' },
  { title: 'Multimeter DT830D', category: 'lab', brand: 'Generic', original: 600, age: 11, type: 'lend' },
  { title: 'Drafter engineering', category: 'lab', brand: 'Rotring', original: 850, age: 15, type: 'lend' },
  { title: 'Semester 4 DSA Notes', category: 'notes', brand: 'Handwritten', original: 200, age: 4, type: 'buy' },
  { title: 'Organic Chemistry Notes Pack', category: 'notes', brand: 'Handwritten', original: 250, age: 5, type: 'buy' },
  { title: 'OS handwritten notes', category: 'notes', brand: 'Handwritten', original: 180, age: 6, type: 'buy' },
  { title: 'Hiking Backpack 40L', category: 'other', brand: 'Quechua', original: 2500, age: 20, type: 'buy' },
  { title: 'Drawing Board A2', category: 'other', brand: 'Local', original: 600, age: 10, type: 'lend' },
  { title: 'Badminton racket pair', category: 'other', brand: 'Yonex', original: 2200, age: 14, type: 'lend' },
  { title: 'Scientific Calculator spare', category: 'electronics', brand: 'Casio', original: 1100, age: 5, type: 'buy' },
]

const ANOMALIES = [
  { title: 'Brand new iPhone 15 half price', category: 'electronics', brand: 'Apple', original: 79900, price: 9000, age: 1, type: 'buy', burst: true },
  { title: 'Gaming Laptop urgent sale', category: 'electronics', brand: 'ASUS', original: 85000, price: 12000, age: 2, type: 'buy', burst: true },
  { title: 'Brand new iPhone 15 half price', category: 'electronics', brand: 'Apple', original: 79900, price: 8900, age: 1, type: 'buy', burst: true },
]

function fairFrom(original, condition, age) {
  const cf = { New: 0.9, 'Like New': 0.78, Good: 0.62, Fair: 0.45 }[condition] || 0.6
  const rec = Math.round(original * cf * Math.max(0.3, 1 - age * 0.012))
  return { rec, min: Math.round(rec * 0.88), max: Math.round(rec * 1.12) }
}

export async function seedDatabase({ clear = true } = {}) {
  if (clear) {
    await Promise.all([
      User.deleteMany({}),
      Listing.deleteMany({}),
      Message.deleteMany({}),
      Transaction.deleteMany({}),
      Review.deleteMany({}),
      Moderation.deleteMany({}),
      Notification.deleteMany({}),
      Watchlist.deleteMany({}),
      Payment.deleteMany({}),
      FraudReport.deleteMany({}),
    ])
  }

  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD || 'CampusDemo123!', 10)
  const adminHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'CampusAdmin123!', 10)

  const userDocs = []
  userDocs.push({
    name: 'Riya Sharma',
    email: 'riya.sharma@campus.edu',
    passwordHash,
    initials: 'RS',
    avatar: '🦊',
    hostel: 'Hostel C',
    trust: 4.7,
    trustScore: 86,
    rating: 4.8,
    reviewCount: 6,
    verified: true,
    verificationStatus: 'verified',
    listingsCount: 0,
    joined: 'August 2024',
    role: 'student',
    isSeed: true,
  })
  userDocs.push({
    name: 'Admin Desk',
    email: 'admin@campus.edu',
    passwordHash: adminHash,
    initials: 'AD',
    avatar: '🐝',
    hostel: 'Admin Block',
    trust: 5,
    trustScore: 98,
    rating: 5,
    reviewCount: 0,
    verified: true,
    verificationStatus: 'verified',
    listingsCount: 0,
    joined: 'May 2024',
    role: 'admin',
    isSeed: true,
  })

  for (let i = 0; i < 28; i++) {
    const first = FIRST[i % FIRST.length]
    const last = LAST[i % LAST.length]
    const name = `${first} ${last}`
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@campus.edu`
    const loc = jitter(i)
    userDocs.push({
      name,
      email,
      passwordHash,
      initials: `${first[0]}${last[0]}`,
      avatar: AVATARS[i % AVATARS.length],
      hostel: HOSTELS[i % HOSTELS.length],
      trust: 3.8 + (i % 12) * 0.1,
      trustScore: 50 + (i % 40),
      rating: 3.6 + (i % 14) * 0.1,
      reviewCount: i % 9,
      verified: true,
      verificationStatus: 'verified',
      listingsCount: 0,
      joined: 'July 2024',
      role: 'student',
      isSeed: true,
      locationSharingEnabled: i % 3 === 0,
      locationExact: i % 3 === 0 ? { type: 'Point', coordinates: [loc.lon, loc.lat] } : undefined,
      locationApprox: i % 3 === 0 ? { geohash: encodeGeohashSafe(loc.lat, loc.lon), label: HOSTELS[i % HOSTELS.length] } : { geohash: null, label: '' },
      locationUpdatedAt: i % 3 === 0 ? new Date() : null,
    })
  }

  const users = await User.insertMany(userDocs)
  const riya = users.find((u) => u.email === 'riya.sharma@campus.edu')
  const sellers = users.filter((u) => u.role === 'student')

  const listings = []
  let n = 0
  while (listings.length < 72) {
    const tpl = LISTING_TEMPLATES[n % LISTING_TEMPLATES.length]
    const seller = sellers[n % sellers.length]
    const condition = CONDITIONS[n % CONDITIONS.length]
    const fair = fairFrom(tpl.original, condition, tpl.age + (n % 5))
    const loc = jitter(n)
    const share = Boolean(seller.locationSharingEnabled)
    const meta = CATEGORY_META[tpl.category]
    const desc = `${tpl.title} in ${condition.toLowerCase()} condition. Campus seed listing for ${tpl.category}. Pickup near ${seller.hostel || 'campus'}.`
    listings.push({
      title: n > 24 ? `${tpl.title} #${Math.floor(n / LISTING_TEMPLATES.length) + 1}` : tpl.title,
      category: tpl.category,
      condition,
      brand: tpl.brand,
      originalPrice: tpl.original,
      askingPrice: fair.rec,
      ageMonths: tpl.age + (n % 5),
      demand: 40 + (n % 50),
      price: fair.rec,
      type: tpl.type,
      listingKind: tpl.type === 'lend' ? 'lend' : 'sale',
      lendUnit: tpl.type === 'lend' ? (n % 2 === 0 ? 'day' : 'week') : null,
      defaultDueDays: tpl.type === 'lend' ? 7 + (n % 7) : null,
      location: `${seller.hostel || 'Campus'} (approx.)`,
      geo: share ? { type: 'Point', coordinates: [loc.lon, loc.lat] } : undefined,
      geoHash: share ? encodeGeohashSafe(loc.lat, loc.lon) : null,
      locationSharingEnabled: share,
      description: desc,
      descriptionHash: hashDesc(desc),
      iconKey: meta.iconKey,
      tape: meta.tape,
      bg: meta.bg,
      seller: sellerSnap(seller),
      fairMin: fair.min,
      fairMax: fair.max,
      recommendedPrice: fair.rec,
      confidence: 70 + (n % 20),
      priceExplanation: 'Seed estimate from condition, age and original price. Model is trained on this seed corpus, not live campus trades yet.',
      aiSource: 'seed',
      status: 'active',
      views: 10 + (n % 80),
      messageCount: n % 5,
      isSeed: true,
      fraudRiskScore: 0.12,
      fraudRiskLevel: 'LOW',
      fraudSignals: ['seed_baseline'],
      fraudDecision: 'none',
    })
    n += 1
  }

  const shady = users.find((u) => u.email.includes('zara')) || sellers[sellers.length - 1]
  for (const a of ANOMALIES) {
    const desc = 'Urgent sale only UPI to unknown number. Limited time.'
    listings.push({
      title: a.title,
      category: a.category,
      condition: 'New',
      brand: a.brand,
      originalPrice: a.original,
      askingPrice: a.price,
      ageMonths: a.age,
      demand: 10,
      price: a.price,
      type: 'buy',
      listingKind: 'sale',
      location: 'Off campus',
      description: desc,
      descriptionHash: hashDesc(desc),
      iconKey: 'electronics',
      tape: 'coral',
      bg: 'coral',
      seller: sellerSnap(shady),
      fairMin: Math.round(a.original * 0.5),
      fairMax: Math.round(a.original * 0.7),
      recommendedPrice: Math.round(a.original * 0.6),
      confidence: 40,
      priceExplanation: 'Seed anomaly for fraud-model testing. Not a real listing from a student trade.',
      aiSource: 'seed',
      status: 'held',
      views: 3,
      messageCount: 0,
      isSeed: true,
      fraudRiskScore: 0.82,
      fraudRiskLevel: 'HIGH',
      fraudSignals: ['extreme_price_deviation', 'duplicate_listing_title', 'thin_listing_content'],
      fraudDecision: 'pending',
    })
  }

  const createdListings = await Listing.insertMany(listings)
  await User.updateMany({ role: 'student', isSeed: true }, { $set: { listingsCount: 3 } })

  const lend = createdListings.filter((l) => l.type === 'lend')
  const sale = createdListings.filter((l) => l.type === 'buy' && l.status === 'active')

  const now = Date.now()
  const txns = []
  if (lend[0] && riya) {
    txns.push({
      item: lend[0].title,
      with: lend[0].seller.name,
      amount: lend[0].price,
      type: 'borrowed',
      date: 'Sep 10',
      listingId: lend[0]._id,
      userId: riya._id,
      borrowerId: riya._id,
      lenderId: lend[0].seller.userId,
      startDate: new Date(now - 4 * 86400000),
      dueDate: new Date(now + 1 * 86400000),
      status: 'DUE_SOON',
      overdueStatus: false,
      isSeed: true,
    })
  }
  if (lend[1] && riya) {
    txns.push({
      item: lend[1].title,
      with: lend[1].seller.name,
      amount: lend[1].price,
      type: 'lent',
      date: 'Sep 1',
      listingId: lend[1]._id,
      userId: riya._id,
      borrowerId: sellers[4]._id,
      lenderId: riya._id,
      startDate: new Date(now - 12 * 86400000),
      dueDate: new Date(now - 2 * 86400000),
      status: 'OVERDUE',
      overdueStatus: true,
      isSeed: true,
    })
  }
  if (lend[2]) {
    txns.push({
      item: lend[2].title,
      with: riya.name,
      amount: lend[2].price,
      type: 'borrowed',
      date: 'Aug 20',
      listingId: lend[2]._id,
      userId: sellers[5]._id,
      borrowerId: sellers[5]._id,
      lenderId: riya._id,
      startDate: new Date(now - 20 * 86400000),
      dueDate: new Date(now - 10 * 86400000),
      returnedAt: new Date(now - 9 * 86400000),
      completedAt: new Date(now - 9 * 86400000),
      status: 'COMPLETED',
      overdueStatus: false,
      isSeed: true,
    })
  }
  if (sale[0] && riya) {
    txns.push({
      item: sale[0].title,
      with: sale[0].seller.name,
      amount: sale[0].price,
      type: 'bought',
      date: 'Aug 14',
      listingId: sale[0]._id,
      userId: riya._id,
      buyerId: riya._id,
      sellerId: sale[0].seller.userId,
      status: 'PAID',
      completedAt: new Date(now - 30 * 86400000),
      isSeed: true,
    })
  }
  const createdTxns = await Transaction.insertMany(txns)

  await Message.insertMany([
    {
      conversationId: `${riya._id}:${sale[0].seller.userId}:${sale[0]._id}`,
      name: sale[0].seller.name,
      avatar: sale[0].seller.avatar,
      preview: 'Is the item still available?',
      body: 'Is the item still available?',
      time: '2m',
      unread: true,
      item: sale[0].title,
      listingId: sale[0]._id,
      fromUserId: sale[0].seller.userId,
      toUserId: riya._id,
      isSeed: true,
    },
    {
      conversationId: `${riya._id}:${lend[0].seller.userId}:${lend[0]._id}`,
      name: lend[0].seller.name,
      avatar: lend[0].seller.avatar,
      preview: 'Can we meet near Block C?',
      body: 'Can we meet near Block C after class?',
      time: '1h',
      unread: false,
      item: lend[0].title,
      listingId: lend[0]._id,
      fromUserId: lend[0].seller.userId,
      toUserId: riya._id,
      isSeed: true,
    },
  ])

  await Review.insertMany([
    { from: 'Aditi Rao', avatar: '🐨', rating: 5, text: 'Smooth exchange, item was exactly as described.', forUserId: riya._id, isSeed: true },
    { from: 'Karan Suri', avatar: '🐢', rating: 5, text: 'Quick response and fair pricing.', forUserId: riya._id, isSeed: true },
    { from: 'Priya Nair', avatar: '🐝', rating: 4, text: 'Good condition, met near the mess as planned.', forUserId: riya._id, isSeed: true },
  ])

  const held = createdListings.filter((l) => l.status === 'held')
  await Moderation.insertMany(
    held.map((l) => ({
      listing: l.title,
      risk: 'High',
      reason: (l.fraudSignals || []).join(', '),
      seller: l.seller.name,
      sellerUserId: l.seller.userId,
      listingId: l._id,
      fraudRiskScore: l.fraudRiskScore,
      signals: l.fraudSignals,
      status: 'pending',
      isSeed: true,
    }))
  )

  await Notification.insertMany([
    { userId: riya._id, title: 'Due soon', body: `${lend[0].title}: Due in 1 day`, type: 'due_soon', relatedId: String(createdTxns[0]._id), isSeed: true },
    { userId: riya._id, title: 'Item overdue', body: `${lend[1].title}: 2 days overdue`, type: 'overdue', relatedId: String(createdTxns[1]._id), isSeed: true },
    { userId: riya._id, title: 'Welcome (seed)', body: 'This account is demo/seed data. Password: CampusDemo123!', type: 'system', isSeed: true },
  ])

  await Watchlist.insertMany([
    { userId: riya._id, listingId: sale[1]._id, isSeed: true },
    { userId: riya._id, listingId: sale[2]._id, isSeed: true },
  ])

  await Payment.insertMany([
    {
      orderId: 'seed_order_paid_1',
      providerPaymentId: 'seed_pay_1',
      transactionId: createdTxns.find((t) => t.type === 'bought')?._id,
      listingId: sale[0]._id,
      userId: riya._id,
      amount: sale[0].price,
      currency: 'INR',
      status: 'paid',
      provider: 'dev',
      verified: true,
      isSeed: true,
    },
  ])

  await FraudReport.create({
    listingId: held[0]?._id,
    reporterId: riya._id,
    accusedUserId: shady._id,
    reason: 'Suspiciously low price for a new flagship phone (seed report).',
    status: 'open',
    isSeed: true,
  })

  return {
    users: users.length,
    listings: createdListings.length,
    transactions: createdTxns.length,
    demoLogin: { email: 'riya.sharma@campus.edu', password: process.env.SEED_PASSWORD || 'CampusDemo123!' },
    adminLogin: { email: 'admin@campus.edu', password: process.env.SEED_ADMIN_PASSWORD || 'CampusAdmin123!' },
  }
}

function encodeGeohashSafe(lat, lon) {
  try {
    return encodeGeohash(lat, lon)
  } catch {
    return 'ttnf0'
  }
}

function hashDesc(text) {
  return hashText(text)
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('seed.js')
if (isDirectRun) {
  try {
    await connectDB()
    const result = await seedDatabase()
    console.log('Seed complete:', result)
  } catch (err) {
    console.error('Seed failed:', err)
    process.exitCode = 1
  } finally {
    await disconnectDB()
  }
}
