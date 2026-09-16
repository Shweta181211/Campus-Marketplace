export function allowedCollegeDomains() {
  const raw = process.env.ALLOWED_COLLEGE_DOMAINS || 'campus.edu,thapar.edu'
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

export function emailDomain(email = '') {
  const at = String(email).toLowerCase().trim().lastIndexOf('@')
  if (at < 0) return ''
  return String(email).toLowerCase().trim().slice(at + 1)
}

export function isAllowedCollegeEmail(email) {
  const domain = emailDomain(email)
  if (!domain) return false
  return allowedCollegeDomains().includes(domain)
}

export function isGmail(email) {
  return emailDomain(email) === 'gmail.com'
}

/** Google Sign-In: verified Gmail, or a Google account on an allowed college domain. */
export function isAllowedGoogleEmail(email) {
  return isGmail(email) || isAllowedCollegeEmail(email)
}
