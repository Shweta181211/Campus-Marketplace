# Week 2 : API Was Open to Anyone

# JWT Guards, Rate Limits and Ownership

## Problem:

Any request could read or change any listing, including
someone else's.

## Relevant Context

There are three kinds of caller: signed in, verified student,
and admin.

## Key Observation

Use small, **composable middleware**, one per rule, chained
on each route.

## Solution

`server/middleware/auth.js`:

``` javascript
export function requireVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const ok = req.user.verified && req.user.verificationStatus === 'verified'
  if (!ok) return res.status(403).json({ error: 'College email verification required' })
  next()
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Insufficient permissions' })
  next()
}
```

Owner check before edit or delete (`server/routes/listings.js`):

``` javascript
if (String(listing.seller?.userId) !== String(req.user._id) && req.user.role !== 'admin') {
  res.status(403).json({ error: 'Insufficient permissions' })
  return null
}
```

Rate limits protect the auth, OTP and general API routes.

**Because**

401 means "not signed in" and 403 means "not allowed", and
each rule is written once and reused.
