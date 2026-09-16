import crypto from 'crypto'

export function generateOtp() {
  return String(crypto.randomInt(100000, 1000000))
}

export function hashOtp(otp, email) {
  const pepper = process.env.OTP_PEPPER || process.env.JWT_SECRET || 'dev-otp-pepper'
  return crypto.createHash('sha256').update(`${pepper}:${email.toLowerCase()}:${otp}`).digest('hex')
}

export function otpEquals(storedHash, otp, email) {
  if (!storedHash || !otp) return false
  const incoming = hashOtp(otp, email)
  const a = Buffer.from(storedHash)
  const b = Buffer.from(incoming)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
