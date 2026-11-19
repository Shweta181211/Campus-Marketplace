# Week 1 : Only Real Students Should Sign Up

# College Email OTP and Google Sign-In

## Problem:

Any e-mail address could create an account.

> POST /api/auth/register  { "email": "someone@yahoo.com" }  ->  201 Created

## Relevant Context

A campus marketplace is only useful if every user is a real
student. Many students also prefer "Continue with Google".

## Key Observation

Being a student means controlling a mailbox on an **allowed
college domain**. This is proved either by an OTP sent to that
mailbox, or by Google's own `email_verified` flag.

## Solution

Domain whitelist (`server/utils/college.js`):

``` javascript
export function isAllowedCollegeEmail(email) {
  const domain = emailDomain(email)
  return !!domain && allowedCollegeDomains().includes(domain)
}
```

OTP stored only as a peppered hash, with expiry and an attempt
limit (`server/utils/otp.js`, `server/routes/auth.js`):

``` javascript
return crypto.createHash('sha256').update(`${pepper}:${email.toLowerCase()}:${otp}`).digest('hex')

if (user.otpAttempts >= OTP_MAX_ATTEMPTS) return res.status(429).json({ error: 'Maximum OTP attempts exceeded' })
if (new Date(user.otpExpiresAt).getTime() < Date.now()) return res.status(400).json({ error: 'OTP expired' })
```

Google tokens are accepted only if the e-mail is verified
(`server/utils/googleAuth.js`):

``` javascript
if (payload.email_verified !== true) {
  const err = new Error('Google email is not verified')
  err.status = 403
  throw err
}
```

**Because**

A leaked database reveals no usable OTPs, guessing is limited
by attempts and time, and Gmail users are verified by the
provider that actually owns the mailbox.
