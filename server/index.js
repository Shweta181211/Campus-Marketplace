import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { connectDB } from './db.js'
import { seedDatabase } from './seed.js'
import Listing from './models/Listing.js'
import listingsRouter from './routes/listings.js'
import usersRouter from './routes/users.js'
import messagesRouter from './routes/messages.js'
import transactionsRouter from './routes/transactions.js'
import reviewsRouter from './routes/reviews.js'
import moderationRouter from './routes/admin.js'
import authRouter from './routes/auth.js'
import locationRouter from './routes/location.js'
import aiRouter from './routes/ai.js'
import watchlistRouter from './routes/watchlist.js'
import notificationsRouter from './routes/notifications.js'
import paymentsRouter from './routes/payments.js'
import { authOptional } from './middleware/auth.js'
import { apiLimiter } from './middleware/rateLimit.js'
import { refreshLoanStatuses } from './utils/loans.js'

const app = express()
const PORT = process.env.PORT || 5001
const MONGO_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting']
const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174').split(',')

app.use(cors({ origin: origins.map((s) => s.trim()), credentials: true }))
app.use(express.json({ limit: '5mb' }))
app.use(apiLimiter)
app.use(authOptional)

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'campus-marketplace-api',
    mongoState: MONGO_STATES[mongoose.connection.readyState] || 'unknown',
    paymentMode: process.env.RAZORPAY_KEY_ID ? 'razorpay' : 'dev',
    mlServiceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  })
})

app.get('/api/categories', (_req, res) => {
  res.json([
    { id: 'books', label: 'Books', tape: 'yellow' },
    { id: 'cycles', label: 'Cycles', tape: 'sky' },
    { id: 'electronics', label: 'Electronics', tape: 'coral' },
    { id: 'lab', label: 'Lab equipment', tape: 'moss' },
    { id: 'furniture', label: 'Furniture', tape: 'yellow' },
    { id: 'hostel', label: 'Hostel essentials', tape: 'sky' },
    { id: 'notes', label: 'Notes', tape: 'coral' },
    { id: 'other', label: 'Other', tape: 'moss' },
  ])
})

app.use('/api/auth', authRouter)
app.use('/api/listings', listingsRouter)
app.use('/api/users', usersRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/transactions', transactionsRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/moderation', moderationRouter)
app.use('/api/admin', moderationRouter)
app.use('/api/location', locationRouter)
app.use('/api/ai', aiRouter)
app.use('/api/watchlist', watchlistRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/payments', paymentsRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

export { app }

async function start() {
  const connection = await connectDB()
  const count = await Listing.countDocuments()
  if (count === 0) {
    const seeded = await seedDatabase({ clear: false })
    console.log('Database was empty — seeded sample data:', seeded)
  }

  setInterval(() => {
    refreshLoanStatuses().catch((err) => console.warn('loan refresh failed', err.message))
  }, 5 * 60 * 1000)
  refreshLoanStatuses().catch(() => {})

  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`)
    console.log(`DB mode: ${connection.mode}`)
  })
}

const isDirect = process.argv[1] && process.argv[1].endsWith('index.js')
if (isDirect) {
  start().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}
