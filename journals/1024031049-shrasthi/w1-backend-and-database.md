# Week 1 : No Backend, and MongoDB Was Not Installed

# Express + Mongoose API with an In-Memory Fallback

## Error:

> MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017

## Relevant Context

The app was only a React frontend with data in
`src/data/mockData.js`. When the new API was started,
`mongod` and Docker were not available, so it crashed.

## Key Observation

Build a separate `server/` package with one router per
resource. Try the real database first, and fall back to
`mongodb-memory-server` instead of crashing.

## Solution

Routers mounted in `server/index.js`:

``` javascript
app.use('/api/auth', authRouter)
app.use('/api/listings', listingsRouter)
app.use('/api/transactions', transactionsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/uploads', uploadsRouter)
app.use('/api/ai', aiRouter)
```

Database fallback in `server/db.js`:

``` javascript
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 })
  return { mode: 'local', uri }
} catch (err) {
  if (process.env.USE_MEMORY_DB === 'false') throw err
  return startMemoryDB()
}
```

**Because**

Data now persists across reloads and users, development works
without installing MongoDB, and switching to Atlas is a
one-line `MONGODB_URI` change.
