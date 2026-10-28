import rateLimit from 'express-rate-limit'

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
})

export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Try again later.' },
})

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
})
