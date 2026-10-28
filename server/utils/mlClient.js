const ML_URL = () => process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000'

async function postJson(path, body, timeoutMs = 4000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${ML_URL()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.detail || data.error || `ML service error (${res.status})`)
      err.status = res.status
      throw err
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

export async function predictPrice(payload) {
  return postJson('/ai/price-predict', payload)
}

export async function scoreFraud(payload) {
  return postJson('/ai/fraud-score', payload)
}
