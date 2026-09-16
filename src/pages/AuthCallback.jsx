import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, setToken } from '../api'
import { useAuth } from '../auth'

export default function AuthCallback() {
  const { loginWithToken } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setError('Google Sign-In did not return a session')
      return
    }
    let cancelled = false
    ;(async () => {
      setToken(token)
      try {
        const me = await api.getCurrentUser()
        if (cancelled) return
        await loginWithToken(token, me)
        navigate('/', { replace: true })
      } catch (err) {
        if (!cancelled) setError(err.message || 'Google Sign-In failed')
      }
    })()
    return () => { cancelled = true }
    // only run for this callback URL
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <p className="text-coral-ink text-sm">{error}</p>
          <button onClick={() => navigate('/auth')} className="mt-4 underline text-sm">Back to login</button>
        </div>
      </div>
    )
  }

  return <div className="p-8 text-sm text-ink-soft">Signing you in with Google…</div>
}
