import { OAuth2Client } from 'google-auth-library'

export function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim()
}

export function googleClientSecret() {
  return String(process.env.GOOGLE_CLIENT_SECRET || '').trim()
}

export function googleRedirectUri() {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:${process.env.PORT || 5001}/api/auth/google/callback`
  )
}

export function googleOAuthEnabled() {
  return Boolean(googleClientId() && googleClientSecret())
}

export function createOAuthClient(redirectUri) {
  return new OAuth2Client(googleClientId(), googleClientSecret(), redirectUri || googleRedirectUri())
}

export function googleAuthUrl(state, redirectUri) {
  return createOAuthClient(redirectUri).generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
    include_granted_scopes: true,
  })
}

function fromPayload(payload) {
  if (!payload?.email) {
    const err = new Error('Google account did not return an email')
    err.status = 400
    throw err
  }
  if (payload.email_verified !== true) {
    const err = new Error('Google email is not verified')
    err.status = 403
    throw err
  }
  return {
    googleId: payload.sub,
    email: String(payload.email).toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || '',
    emailVerified: true,
  }
}

export async function verifyGoogleIdToken(idToken) {
  const clientId = googleClientId()
  if (!clientId) {
    const err = new Error('Google Sign-In is not configured. Set GOOGLE_CLIENT_ID in server/.env')
    err.status = 503
    throw err
  }
  if (!idToken) {
    const err = new Error('Google ID token is required')
    err.status = 400
    throw err
  }
  const client = new OAuth2Client(clientId)
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  })
  return fromPayload(ticket.getPayload())
}

export async function exchangeGoogleCode(code, redirectUri) {
  if (!googleOAuthEnabled()) {
    const err = new Error('Google Sign-In is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET')
    err.status = 503
    throw err
  }
  if (!code) {
    const err = new Error('Google authorization code is missing')
    err.status = 400
    throw err
  }
  const client = createOAuthClient(redirectUri)
  const { tokens } = await client.getToken(code)
  if (!tokens.id_token) {
    const err = new Error('Google did not return a verified ID token')
    err.status = 401
    throw err
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: googleClientId(),
  })
  return fromPayload(ticket.getPayload())
}
