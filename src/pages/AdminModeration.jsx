import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'

const riskStyles = {
  Low: 'bg-moss-bg text-moss-ink border-moss-ink/30',
  Medium: 'bg-yellow-bg text-yellow-ink border-yellow-ink/30',
  High: 'bg-coral-bg text-coral-ink border-coral-ink/30',
  LOW: 'bg-moss-bg text-moss-ink border-moss-ink/30',
  MEDIUM: 'bg-yellow-bg text-yellow-ink border-yellow-ink/30',
  HIGH: 'bg-coral-bg text-coral-ink border-coral-ink/30',
}

export default function AdminModeration() {
  const { user } = useAuth()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = () => {
    setLoading(true)
    api.getFraudAlerts().then(setQueue).catch(() => setQueue([])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  if (user?.role !== 'admin') {
    return <div className="max-w-3xl mx-auto px-4 py-8 text-sm text-coral-ink">Admin only. Students cannot access fraud review.</div>
  }

  const review = async (listingId, decision) => {
    try {
      await api.reviewListing(listingId, decision)
      setMsg(`Listing ${decision}`)
      load()
    } catch (err) {
      setMsg(err.message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert size={20} />
        <h1 className="font-display font-bold text-2xl">Fraud review</h1>
      </div>
      <p className="text-sm text-ink-soft mb-6">Isolation Forest flags listings for humans. Nothing is auto-accused as fraud.</p>
      {msg && <p className="text-xs mb-3">{msg}</p>}
      {loading ? <p className="text-sm text-ink-soft">Loading…</p> : queue.length === 0 ? (
        <p className="text-sm text-ink-soft">Queue is empty.</p>
      ) : (
        <div className="space-y-3">
          {queue.map((m) => (
            <div key={m.id} className="bg-paper-card border-[1.5px] border-ink rounded-md p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{m.listing}</p>
                  <p className="text-xs text-ink-soft mt-0.5">Seller: {m.seller}</p>
                  <p className="text-xs font-mono mt-1">Score {m.fraudRiskScore ?? m.listingDoc?.fraudRiskScore}</p>
                </div>
                <span className={`text-xs font-mono font-medium px-2.5 py-1 rounded-full border shrink-0 ${riskStyles[m.risk] || riskStyles.Medium}`}>
                  {m.risk} risk
                </span>
              </div>
              <p className="text-xs text-ink-soft mt-3">{m.reason}</p>
              <p className="text-[11px] mt-1">{(m.signals || m.listingDoc?.fraudSignals || []).join(', ')}</p>
              {m.listingId && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => review(m.listingId, 'approve')} className="text-xs font-medium border-[1.5px] border-ink rounded-full px-3.5 py-1.5">Approve</button>
                  <button onClick={() => review(m.listingId, 'reject')} className="text-xs font-medium text-coral-ink px-3.5 py-1.5">Reject / remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
