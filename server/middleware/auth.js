import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, verified: user.verified },
    process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )
}

export function authOptional(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next()
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-jwt-secret-change-me')
    req.auth = payload
  } catch {
    req.auth = null
  }
  next()
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-jwt-secret-change-me')
    const user = await User.findById(payload.sub)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = user
    req.auth = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

export function requireVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const ok = req.user.verified && req.user.verificationStatus === 'verified'
  if (!ok) {
    return res.status(403).json({
      error: 'College email verification required',
      verificationStatus: req.user.verificationStatus || 'unverified',
    })
  }
  next()
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }
  next()
}

export function publicUser(user) {
  if (!user) return null
  if (typeof user.toPublicJSON === 'function') return user.toPublicJSON()
  const obj = user.toObject ? user.toObject() : { ...user }
  delete obj.passwordHash
  delete obj.otpHash
  delete obj.otpExpiresAt
  delete obj.otpAttempts
  delete obj.otpSentAt
  delete obj.resendCount
  delete obj.locationExact
  obj.id = obj._id?.toString?.() || obj.id
  return obj
}
