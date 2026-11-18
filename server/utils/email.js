import nodemailer from 'nodemailer'

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  return transporter
}

/**
 * Send an email. Without SMTP settings the message is printed to the server console (dev mode).
 * If SMTP is configured but fails and DEV_RETURN_OTP=true, we also fall back to the console instead of
 * breaking sign-up during local development.
 */
export async function sendEmail(to, subject, text) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@campus-marketplace.local'
  const mailer = getTransporter()
  if (!mailer) {
    console.log(`[email fallback] To: ${to} | ${subject} | ${text}`)
    return { delivered: false, mode: 'console' }
  }
  try {
    await mailer.sendMail({ from, to, subject, text })
    return { delivered: true, mode: 'smtp' }
  } catch (err) {
    if (process.env.DEV_RETURN_OTP === 'true') {
      console.warn(`[email] SMTP failed (${err.message}); printing instead. To: ${to} | ${subject} | ${text}`)
      return { delivered: false, mode: 'console' }
    }
    throw err
  }
}

export async function sendOtpEmail(to, otp) {
  return sendEmail(
    to,
    'Your Campus Marketplace verification code',
    `Your campus email verification code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`
  )
}
