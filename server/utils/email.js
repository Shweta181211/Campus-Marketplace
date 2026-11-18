import nodemailer from 'nodemailer'

let transporter = null

function smtpSettings() {
  const host = String(process.env.SMTP_HOST || '').trim()
  const user = String(process.env.SMTP_USER || '').trim()
  // Gmail shows app passwords as "abcd efgh ijkl mnop" — the spaces are not part of the password
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '')
  const port = Number(process.env.SMTP_PORT || 587)
  return { host, user, pass, port }
}

export function smtpConfigured() {
  const { host, user, pass } = smtpSettings()
  return Boolean(host && user && pass)
}

function getTransporter() {
  if (transporter) return transporter
  const { host, user, pass, port } = smtpSettings()
  if (!host || !user || !pass) return null
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  })
  return transporter
}

/** Called once at server start: prints whether OTP e-mails will really be delivered. */
export async function checkEmailSetup() {
  const mailer = getTransporter()
  if (!mailer) {
    console.log('[email] SMTP not configured — OTP codes are printed in this terminal instead of being e-mailed.')
    return false
  }
  try {
    await mailer.verify()
    console.log(`[email] SMTP ready — OTP e-mails will be sent from ${process.env.SMTP_FROM || smtpSettings().user}`)
    return true
  } catch (err) {
    console.warn(`[email] SMTP login FAILED (${err.message}). Check SMTP_USER / SMTP_PASS (Gmail needs an App Password).`)
    return false
  }
}

export async function sendOtpEmail(to, otp) {
  const from = process.env.SMTP_FROM || smtpSettings().user || 'noreply@campus-marketplace.local'
  const subject = 'Your Campus Marketplace verification code'
  const text = `Your campus email verification code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`

  const mailer = getTransporter()
  if (!mailer) {
    console.log(`[OTP email fallback] To: ${to}  Code: ${otp}`)
    return { delivered: false, mode: 'console' }
  }

  try {
    await mailer.sendMail({ from, to, subject, text })
    console.log(`[email] OTP sent to ${to}`)
    return { delivered: true, mode: 'smtp' }
  } catch (err) {
    console.warn(`[email] Could not send OTP to ${to}: ${err.message}`)
    if (process.env.DEV_RETURN_OTP === 'true') {
      console.log(`[OTP email fallback] To: ${to}  Code: ${otp}`)
      return { delivered: false, mode: 'console', error: err.message }
    }
    const e = new Error('Could not send the verification e-mail. Please try again in a minute.')
    e.status = 502
    throw e
  }
}
