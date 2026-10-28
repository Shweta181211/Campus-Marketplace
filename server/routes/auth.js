import { Router } from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { isAllowedCollegeEmail, allowedCollegeDomains, isGmail, isAllowedGoogleEmail } from '../utils/college.js'
import { generateOtp, hashOtp, otpEquals } from '../utils/otp.js'
import { sendOtpEmail } from '../utils/email.js'
import { signToken, requireAuth, publicUser } from '../middleware/auth.js'
import { authLimiter, otpLimiter } from '../middleware/rateLimit.js'
import { recomputeTrustScore } from '../utils/trust.js'
import { verifyGoogleIdToken, googleOAuthEnabled, googleClientId, googleAuthUrl, exchangeGoogleCode, googleRedirectUri } from '../utils/googleAuth.js'
import crypto from 'crypto'

const router = Router()
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 10 * 60 * 1000)
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5)
const RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS || 60 * 1000)

function initialsFrom(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

async function issueOtp(user) {
  const now = Date.now()
  if (user.otpSentAt && now - new Date(user.otpSentAt).getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - new Date(user.otpSentAt).getTime())) / 1000)
    const err = new Error(`Please wait ${wait}s before requesting another code`)
    err.status = 429
    throw err
  }
  const otp = generateOtp()
  user.otpHash = hashOtp(otp, user.email)
  user.otpExpiresAt = new Date(now + OTP_TTL_MS)
  user.otpAttempts = 0
  user.otpSentAt = new Date(now)
  user.resendCount = (user.resendCount || 0) + 1
  user.verificationStatus = 'pending'
  await user.save()
  const delivery = await sendOtpEmail(user.email, otp)
  return { otp, delivery }
}

function readCookie(req, name) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('=') || '')
  }
  return ''
}

function allowedFrontendOrigins() {
  return (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function frontendOrigin(req) {
  const fromCookie = readCookie(req, 'g_oauth_next')
  try {
    const origin = new URL(fromCookie).origin
    if (allowedFrontendOrigins().includes(origin)) return origin
  } catch {
    /* ignore */
  }
  return process.env.FRONTEND_URL || 'http://localhost:5174'
}

async function loginWithGoogleProfile(profile) {
  if (!isAllowedGoogleEmail(profile.email)) {
    const err = new Error('This Google account is not allowed. Use a verified Gmail or college Google account.')
    err.status = 400
    throw err
  }
  let user = await User.findOne({
    $or: [{ googleId: profile.googleId }, { email: profile.email }],
  })
  if (!user) {
    user = new User({
      name: profile.name,
      email: profile.email,
      initials: initialsFrom(profile.name),
      avatar: '🦊',
      role: 'student',
      joined: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    })
  }
  user.googleId = profile.googleId
  user.authProvider = 'google'
  user.verified = true
  user.verificationStatus = 'verified'
  user.name = user.name || profile.name
  await user.save()
  await recomputeTrustScore(user._id)
  const fresh = await User.findById(user._id)
  return { token: signToken(fresh), user: publicUser(fresh) }
}

function googleSetupHtml() {
  const redirect = googleRedirectUri()
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:640px;margin:40px auto;line-height:1.5">
  <h1>Google Sign-In is not configured</h1>
  <p>Create OAuth credentials, then put them in <code>server/.env</code> and restart <code>npm run server</code>.</p>
  <ol>
    <li>Open <a href="https://console.cloud.google.com/apis/credentials">Google Cloud Credentials</a></li>
    <li>Create project → <b>OAuth client ID</b> → Application type <b>Web application</b></li>
    <li>Authorized JavaScript origins (no path):<br>
      <code>http://localhost:5173</code><br>
      <code>http://localhost:5174</code><br>
      <code>http://localhost:5001</code>
    </li>
    <li>Authorized redirect URIs — this exact URL only:<br><code>${redirect}</code></li>
  </ol>
  <p><a href="javascript:history.back()">Back to login</a></p>
  </body></html>`
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, hostel = '', avatar = '🦊' } = req.body || {}
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, college email and password are required' })
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }
    if (isGmail(email)) {
      return res.status(400).json({
        error: 'Use Continue with Google for Gmail. Google verifies the mailbox.',
      })
    }
    if (!isAllowedCollegeEmail(email)) {
      return res.status(400).json({
        error: 'Invalid college email',
        allowedDomains: allowedCollegeDomains(),
      })
    }

    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing && existing.verified) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user =
      existing ||
      new User({
        name,
        email: email.toLowerCase(),
        initials: initialsFrom(name),
        avatar,
        hostel,
        joined: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        role: 'student',
        verified: false,
        verificationStatus: 'pending',
      })

    user.name = name
    user.passwordHash = passwordHash
    user.hostel = hostel || user.hostel
    user.avatar = avatar || user.avatar
    user.verified = false
    user.verificationStatus = 'pending'

    const { otp, delivery } = await issueOtp(user)
    const payload = {
      ok: true,
      verificationStatus: 'pending',
      message: 'OTP sent to your college email',
      deliveryMode: delivery.mode,
      user: publicUser(user),
    }
    if (process.env.DEV_RETURN_OTP === 'true') payload.devOtp = otp
    res.status(201).json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body || {}
    if (!email) return res.status(400).json({ error: 'email is required' })
    const user = await User.findOne({ email: email.toLowerCase() }).select('+otpHash +otpExpiresAt +otpAttempts +otpSentAt +resendCount')
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.verified) return res.status(400).json({ error: 'Account already verified' })
    const { otp, delivery } = await issueOtp(user)
    const payload = { ok: true, deliveryMode: delivery.mode, verificationStatus: 'pending' }
    if (process.env.DEV_RETURN_OTP === 'true') payload.devOtp = otp
    res.json(payload)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/verify', otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body || {}
    if (!email || !otp) return res.status(400).json({ error: 'email and OTP are required' })

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+otpHash +otpExpiresAt +otpAttempts +otpSentAt +resendCount +passwordHash'
    )
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.verified) {
      const token = signToken(user)
      return res.json({ ok: true, token, user: publicUser(user), verificationStatus: 'verified' })
    }
    if (!user.otpHash || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'No OTP pending. Request a new code.' })
    }
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      user.verificationStatus = 'failed'
      await user.save()
      return res.status(429).json({ error: 'Maximum OTP attempts exceeded', verificationStatus: 'failed' })
    }
    if (new Date(user.otpExpiresAt).getTime() < Date.now()) {
      user.verificationStatus = 'failed'
      await user.save()
      return res.status(400).json({ error: 'OTP expired', verificationStatus: 'failed' })
    }
    if (!otpEquals(user.otpHash, String(otp).trim(), user.email)) {
      user.otpAttempts += 1
      if (user.otpAttempts >= OTP_MAX_ATTEMPTS) user.verificationStatus = 'failed'
      await user.save()
      return res.status(400).json({ error: 'Invalid OTP', verificationStatus: user.verificationStatus })
    }

    user.verified = true
    user.verificationStatus = 'verified'
    user.otpHash = null
    user.otpExpiresAt = null
    user.otpAttempts = 0
    await user.save()
    await recomputeTrustScore(user._id)
    const fresh = await User.findById(user._id)
    const token = signToken(fresh)
    res.json({ ok: true, token, user: publicUser(fresh), verificationStatus: 'verified' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' })
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +otpHash')
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid email or password' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' })
    if (!user.verified || user.verificationStatus !== 'verified') {
      return res.status(403).json({
        error: 'College email verification required',
        verificationStatus: user.verificationStatus || 'pending',
        email: user.email,
      })
    }
    const token = signToken(user)
    res.json({ ok: true, token, user: publicUser(user) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function oauthRedirectUri() {
  // Always the env callback on :5001. Do not use the Vite host (5173/5174) —
  // that is what caused Google Error 400: redirect_uri_mismatch.
  return googleRedirectUri()
}

router.get('/google/start', authLimiter, (req, res) => {
  if (!googleOAuthEnabled()) {
    res.status(503).type('html').send(googleSetupHtml())
    return
  }
  const state = crypto.randomBytes(16).toString('hex')
  const next = req.get('referer') || process.env.FRONTEND_URL || 'http://localhost:5173'
  const redirectUri = oauthRedirectUri()
  res.cookie('g_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 })
  res.cookie('g_oauth_next', next, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 })
  res.cookie('g_oauth_redirect', redirectUri, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 })
  res.redirect(googleAuthUrl(state, redirectUri))
})

router.get('/google/callback', async (req, res) => {
  const origin = frontendOrigin(req)
  const fail = (msg) => res.redirect(`${origin}/auth?google_error=${encodeURIComponent(msg)}`)
  try {
    if (req.query.error) return fail(String(req.query.error))
    const expected = readCookie(req, 'g_oauth_state')
    if (!expected || expected !== String(req.query.state || '')) {
      return fail('Google Sign-In expired. Try again.')
    }
    const redirectUri = oauthRedirectUri()
    const profile = await exchangeGoogleCode(String(req.query.code || ''), redirectUri)
    const { token } = await loginWithGoogleProfile(profile)
    res.redirect(`${origin}/auth/callback?token=${encodeURIComponent(token)}`)
  } catch (err) {
    fail(err.message || 'Google Sign-In failed')
  }
})

router.post('/google', authLimiter, async (req, res) => {
  try {
    const { idToken } = req.body || {}
    const profile = await verifyGoogleIdToken(idToken)
    const { token, user } = await loginWithGoogleProfile(profile)
    res.json({
      ok: true,
      token,
      user,
      verificationStatus: 'verified',
    })
  } catch (err) {
    const message = err.message || 'Google Sign-In failed'
    const status = err.status || (String(message).includes('Token') ? 401 : 500)
    res.status(status).json({ error: message })
  }
})

router.post('/logout', requireAuth, async (_req, res) => {
  res.json({ ok: true })
})

router.get('/me', requireAuth, async (req, res) => {
  res.json(publicUser(req.user))
})

router.get('/domains', (_req, res) => {
  res.json({ allowedDomains: allowedCollegeDomains(), googleDomains: ['gmail.com', ...allowedCollegeDomains()] })
})

router.get('/google-config', (_req, res) => {
  res.json({
    enabled: googleOAuthEnabled(),
    clientId: googleOAuthEnabled() ? googleClientId() : '',
    startUrl: '/api/auth/google/start',
  })
})

export default router
