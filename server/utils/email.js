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

export async function sendOtpEmail(to, otp) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@campus-marketplace.local'
  const subject = 'Your Campus Marketplace verification code'
  const text = `Your campus email verification code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`

  const mailer = getTransporter()
  if (!mailer) {
    console.log(`[OTP email fallback] To: ${to}  Code: ${otp}`)
    return { delivered: false, mode: 'console' }
  }

  await mailer.sendMail({ from, to, subject, text })
  return { delivered: true, mode: 'smtp' }
}
