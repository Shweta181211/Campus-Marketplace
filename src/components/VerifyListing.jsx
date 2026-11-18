import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { api } from '../api'

/** MEDIUM fraud risk -> the seller confirms the listing with the 6-digit code emailed to their college address. */
export default function VerifyListing({ listingId, devOtp, onVerified, compact = false }) {
  const [otp, setOtp] = useState('')
  const [msg, setMsg] = useState('')
  const [hint, setHint] = useState(devOtp || '')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      const l = await api.verifyListing(listingId, otp)
      setMsg('Verified — your listing is live.')
      onVerified?.(l)
    } catch (err) {
      setMsg(err.message)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    try {
      const r = await api.resendListingCode(listingId)
      setMsg(r.message)
      if (r.devOtp) setHint(r.devOtp)
    } catch (err) {
      setMsg(err.message)
    }
  }

  return (
    <form onSubmit={submit} className={`bg-yellow-bg border border-yellow-ink/30 rounded-md ${compact ? 'p-2.5' : 'p-3.5'} text-left`}>
      <p className="text-xs text-yellow-ink flex items-center gap-1.5 font-medium">
        <ShieldCheck size={13} /> Extra verification needed
      </p>
      {!compact && (
        <p className="text-[11px] text-ink-soft mt-1">
          Our fraud model saw a few unusual signals (this is not an accusation). Enter the code we emailed to your college address to publish.
        </p>
      )}
      <div className="flex gap-2 mt-2">
        <input
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="6-digit"
          className="w-32 bg-white border-[1.5px] border-ink rounded-md px-2 py-1 text-sm font-mono"
        />
        <button disabled={busy || otp.length !== 6} className="bg-ink text-paper rounded-full px-3 py-1 text-xs disabled:opacity-50">Verify</button>
        <button type="button" onClick={resend} className="text-[11px] underline text-ink-soft">Resend</button>
      </div>
      {hint && <p className="text-[10.5px] font-mono text-ink-soft mt-1.5">Dev mode code: {hint}</p>}
      {msg && <p className="text-[11px] mt-1.5">{msg}</p>}
    </form>
  )
}
