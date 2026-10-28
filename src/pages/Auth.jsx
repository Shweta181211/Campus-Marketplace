import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { api } from '../api'

export default function AuthPage() {
  const { loginWithToken } = useAuth()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [hostel, setHostel] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationStatus, setVerificationStatus] = useState('')
  const [otp, setOtp] = useState('')
  const [domains, setDomains] = useState([])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [devOtp, setDevOtp] = useState('')
  const [googleCfg, setGoogleCfg] = useState({ enabled: false })

  useEffect(() => {
    api.getDomains().then((d) => setDomains(d.allowedDomains || [])).catch(() => {})
    api.getGoogleConfig().then(setGoogleCfg).catch(() => {})
    const gErr = searchParams.get('google_error')
    if (gErr) setError(gErr)
  }, [searchParams])

  const onRegister = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.register({ name, email, password, hostel })
      setPendingEmail(email)
      setMode('verify')
      setVerificationStatus(res.verificationStatus || 'pending')
      setDevOtp(res.devOtp || '')
      setInfo(res.devOtp ? `Demo OTP (DEV_RETURN_OTP): ${res.devOtp}` : 'OTP sent to your college email.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onLogin = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.login({ email, password })
      await loginWithToken(res.token, res.user)
    } catch (err) {
      if (err.status === 403 && err.payload?.email) {
        setPendingEmail(err.payload.email)
        setMode('verify')
        setVerificationStatus(err.payload.verificationStatus || 'pending')
        setInfo('Or tap Continue with Google if this is a Google/Gmail account.')
      }
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onVerify = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.verifyOtp({ email: pendingEmail || email, otp })
      setVerificationStatus(res.verificationStatus || 'verified')
      if (res.token) await loginWithToken(res.token, res.user)
    } catch (err) {
      setVerificationStatus(err.payload?.verificationStatus || 'failed')
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onResend = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await api.resendOtp({ email: pendingEmail || email })
      setDevOtp(res.devOtp || '')
      setInfo(res.devOtp ? `New demo OTP: ${res.devOtp}` : 'A new OTP was sent.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-paper-card border-[1.5px] border-ink rounded-md p-6">
        <h1 className="font-display font-extrabold text-2xl mb-1">
          campus<span className="text-tape-coral">market</span>
        </h1>
        <p className="text-sm text-ink-soft mb-5">Sign in with Google (verified Gmail / college Google account).</p>

        <a
          href="/api/auth/google/start"
          className="w-full flex items-center justify-center gap-2 border-[1.5px] border-ink rounded-full py-2.5 text-sm font-medium bg-white hover:bg-paper"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.7 7.2l.1.1 6.3 5.3C36.8 41.4 44 36 44 24c0-1.3-.1-2.5-.4-3.5z" />
          </svg>
          Continue with Google
        </a>
        <p className="text-[11px] text-ink-soft mt-2 text-center">
          Opens Google account picker. Only Google-verified emails are accepted
          {googleCfg.enabled ? '.' : ' — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env if the next page asks for setup.'}
        </p>

        <div className="inline-flex bg-white border-[1.5px] border-ink rounded-full p-1 my-5">
          {['login', 'register'].map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => { setMode(m); setError(''); setInfo('') }}
              className={`px-4 py-1.5 rounded-full text-sm capitalize ${mode === m || (mode === 'verify' && m === 'register') ? 'bg-ink text-paper' : 'text-ink-soft'}`}
            >
              {m}
            </button>
          ))}
        </div>

        {mode !== 'verify' && (
          <form onSubmit={mode === 'register' ? onRegister : onLogin} className="space-y-3">
            <p className="text-[11px] font-mono text-ink-soft">College email + OTP (optional if you use Google)</p>
            {mode === 'register' && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm" required />
            )}
            {mode === 'register' && (
              <input value={hostel} onChange={(e) => setHostel(e.target.value)} placeholder="Hostel / block (optional)" className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm" />
            )}
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="College email" type="email" className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm" required />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 8 chars)" type="password" className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm" required />
            {mode === 'register' && (
              <p className="text-xs text-ink-soft">OTP domains: {domains.join(', ') || 'configured on server'}. Gmail must use Google above.</p>
            )}
            <button disabled={busy} className="w-full bg-ink text-paper rounded-full py-2.5 text-sm font-medium disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'register' ? 'Send OTP' : 'Log in'}
            </button>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={onVerify} className="space-y-3">
            <p className={`text-[11px] font-mono uppercase mb-1 ${
              verificationStatus === 'failed' ? 'text-coral-ink' : verificationStatus === 'verified' ? 'text-moss-ink' : 'text-yellow-ink'
            }`}>
              {verificationStatus === 'failed' ? 'Verification failed' : verificationStatus === 'verified' ? 'Verified' : 'Verification pending'}
            </p>
            <p className="text-sm">OTP for <span className="font-mono">{pendingEmail}</span>, or use Continue with Google if this mailbox is a Google account.</p>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit OTP" className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm font-mono" required />
            <button disabled={busy} className="w-full bg-ink text-paper rounded-full py-2.5 text-sm font-medium">Verify college email</button>
            <button type="button" onClick={onResend} className="w-full text-xs text-ink-soft underline">Resend OTP</button>
          </form>
        )}

        {error && <p className="text-sm text-coral-ink mt-3">{error}</p>}
        {info && <p className="text-sm text-moss-ink mt-3">{info}</p>}
        {devOtp && <p className="text-xs font-mono mt-2">DEV OTP: {devOtp}</p>}

        <p className="text-[11px] text-ink-soft mt-6">
          Seed demo: <span className="font-mono">riya.sharma@campus.edu</span> / <span className="font-mono">CampusDemo123!</span>
          <br />Admin: <span className="font-mono">admin@campus.edu</span> / <span className="font-mono">CampusAdmin123!</span>
        </p>
      </div>
    </div>
  )
}
