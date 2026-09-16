const API_BASE = import.meta.env.VITE_API_URL || '/api'

export function getToken() {
  return localStorage.getItem('cm_token') || ''
}

export function setToken(token) {
  if (token) localStorage.setItem('cm_token', token)
  else localStorage.removeItem('cm_token')
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.detail || `Request failed (${res.status})`)
    err.status = res.status
    err.payload = data
    throw err
  }
  return data
}

export const api = {
  health: () => request('/health'),
  getListings: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString()
    return request(`/listings${qs ? `?${qs}` : ''}`)
  },
  getMyListings: () => request('/listings/mine'),
  getListing: (id) => request(`/listings/${id}`),
  createListing: (body) => request('/listings', { method: 'POST', body: JSON.stringify(body) }),
  updateListing: (id, body) => request(`/listings/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteListing: (id) => request(`/listings/${id}`, { method: 'DELETE' }),
  getCurrentUser: () => request('/auth/me'),
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  verifyOtp: (body) => request('/auth/verify', { method: 'POST', body: JSON.stringify(body) }),
  resendOtp: (body) => request('/auth/resend-otp', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/auth/logout', { method: 'POST', body: '{}' }),
  googleLogin: (body) => request('/auth/google', { method: 'POST', body: JSON.stringify(body) }),
  getGoogleConfig: () => request('/auth/google-config'),
  getDomains: () => request('/auth/domains'),
  getMessages: () => request('/messages'),
  getConversation: (id) => request(`/messages/${encodeURIComponent(id)}`),
  createMessage: (body) => request('/messages', { method: 'POST', body: JSON.stringify(body) }),
  getTransactions: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/transactions${qs ? `?${qs}` : ''}`)
  },
  createTransaction: (body) => request('/transactions', { method: 'POST', body: JSON.stringify(body) }),
  approveTransaction: (id) => request(`/transactions/${id}/approve`, { method: 'POST', body: '{}' }),
  rejectTransaction: (id) => request(`/transactions/${id}/reject`, { method: 'POST', body: '{}' }),
  updateDueDate: (id, dueDate) =>
    request(`/transactions/${id}/due-date`, { method: 'PUT', body: JSON.stringify({ dueDate }) }),
  returnTransaction: (id) => request(`/transactions/${id}/return`, { method: 'PUT', body: '{}' }),
  extendTransaction: (id, body) => request(`/transactions/${id}/extend`, { method: 'POST', body: JSON.stringify(body) }),
  agreeMeeting: (id, body) => request(`/transactions/${id}/meeting`, { method: 'PUT', body: JSON.stringify(body) }),
  getReviews: () => request('/reviews'),
  getModeration: () => request('/moderation'),
  getFraudAlerts: () => request('/admin/fraud-alerts'),
  reviewListing: (id, decision) =>
    request(`/admin/listings/${id}/review`, { method: 'PUT', body: JSON.stringify({ decision }) }),
  updateModeration: (id, status) =>
    request(`/moderation/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  predictPrice: (body) => request('/ai/price-predict', { method: 'POST', body: JSON.stringify(body) }),
  fraudScore: (body) => request('/ai/fraud-score', { method: 'POST', body: JSON.stringify(body) }),
  setLocationPref: (enabled) =>
    request('/location/preferences', { method: 'PUT', body: JSON.stringify({ enabled }) }),
  setLocation: (body) => request('/location', { method: 'PUT', body: JSON.stringify(body) }),
  getNearby: () => request('/location/nearby'),
  getWatchlist: () => request('/watchlist'),
  addWatchlist: (listingId) => request('/watchlist', { method: 'POST', body: JSON.stringify({ listingId }) }),
  removeWatchlist: (listingId) => request(`/watchlist/${listingId}`, { method: 'DELETE' }),
  getNotifications: () => request('/notifications'),
  readNotification: (id) => request(`/notifications/${id}/read`, { method: 'PUT', body: '{}' }),
  createOrder: (body) => request('/payments/create-order', { method: 'POST', body: JSON.stringify(body) }),
  verifyPayment: (body) => request('/payments/verify', { method: 'POST', body: JSON.stringify(body) }),
  devCompletePayment: (body) => request('/payments/dev-complete', { method: 'POST', body: JSON.stringify(body) }),
  getPayment: (id) => request(`/payments/${id}`),
  getTrustScore: (id) => request(`/users/${id}/trust-score`),
}

export function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve(window.Razorpay)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(window.Razorpay)
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout'))
    document.body.appendChild(script)
  })
}
