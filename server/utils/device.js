import crypto from 'crypto'
import User from '../models/User.js'

/**
 * Duplicate-account detection. The browser sends a random per-device id (X-Device-Id, kept in localStorage);
 * the server stores only a peppered hash of it plus a hash of the signup IP. Accounts sharing a device are
 * "linked accounts" — one input to the fraud model, never an automatic ban (roommates share laptops).
 */
const pepper = () => process.env.OTP_PEPPER || process.env.JWT_SECRET || 'dev-device-pepper'

export function hashId(value) {
  if (!value) return null
  return crypto.createHash('sha256').update(`${pepper()}:${String(value).slice(0, 200)}`).digest('hex')
}

export function deviceHashFrom(req) {
  const id = req.headers['x-device-id']
  return typeof id === 'string' && id.length >= 8 ? hashId(id) : null
}

export function ipHashFrom(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || ''
  return ip ? hashId(`ip:${ip}`) : null
}

/** Remember the device on the user (max 10 most recent). */
export async function rememberDevice(userId, req) {
  const h = deviceHashFrom(req)
  if (!h || !userId) return
  await User.updateOne({ _id: userId }, { $addToSet: { deviceHashes: h } })
  const u = await User.findById(userId).select('+deviceHashes')
  if (u && u.deviceHashes.length > 10) {
    u.deviceHashes = u.deviceHashes.slice(-10)
    await u.save()
  }
}

/** Number of OTHER accounts seen on any of this user's devices. */
export async function linkedAccountCount(userId) {
  if (!userId) return 0
  const u = await User.findById(userId).select('+deviceHashes +signupIpHash')
  if (!u) return 0
  const or = []
  if (u.deviceHashes?.length) or.push({ deviceHashes: { $in: u.deviceHashes } })
  if (!or.length) return 0
  return User.countDocuments({ _id: { $ne: u._id }, $or: or })
}

export async function accountsOnDevice(req) {
  const h = deviceHashFrom(req)
  if (!h) return 0
  return User.countDocuments({ deviceHashes: h })
}
