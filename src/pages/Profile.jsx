import { useEffect, useState } from 'react'
import { ShieldCheck, Star, ListChecks, Mail, MapPin, LogOut } from 'lucide-react'
import Avatar from '../components/Avatar'
import WashiTape from '../components/WashiTape'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Profile() {
  const { user, refresh, logout } = useAuth()
  const [reviews, setReviews] = useState([])
  const [trust, setTrust] = useState(null)
  const [locMsg, setLocMsg] = useState('')
  const [enabled, setEnabled] = useState(Boolean(user?.locationSharingEnabled))

  useEffect(() => {
    api.getReviews().then(setReviews).catch(() => setReviews([]))
    if (user?.id || user?._id) {
      api.getTrustScore(user.id || user._id).then(setTrust).catch(() => {})
    }
    setEnabled(Boolean(user?.locationSharingEnabled))
  }, [user])

  const toggleLocation = async (on) => {
    try {
      await api.setLocationPref(on)
      setEnabled(on)
      if (!on) {
        setLocMsg('Nearby discovery off. Stored location removed.')
        await refresh()
        return
      }
      if (!navigator.geolocation) {
        setLocMsg('Location permission denied or unavailable in this browser.')
        await api.setLocationPref(false)
        setEnabled(false)
        return
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await api.setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Approximate campus area' })
          setLocMsg('Approximate location stored for nearby discovery. Exact coordinates are never shown publicly.')
          await refresh()
        },
        async () => {
          setLocMsg('Location permission denied')
          await api.setLocationPref(false)
          setEnabled(false)
        }
      )
    } catch (err) {
      setLocMsg(err.message)
    }
  }

  const status = user?.verificationStatus || (user?.verified ? 'verified' : 'unverified')

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
      <div className="relative bg-paper-card border-[1.5px] border-ink rounded-md p-6" style={{ transform: 'rotate(-0.5deg)' }}>
        <WashiTape color="yellow" rotate={-6} className="-top-2.5 left-10" width={60} />
        <div className="flex items-center gap-4">
          <Avatar emoji={user.avatar} size="xl" rotate={-3} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-xl">{user.name}</h1>
              {user.verified && <ShieldCheck size={18} className="text-moss-ink" />}
            </div>
            <p className="text-xs text-ink-soft flex items-center gap-1.5 mt-1"><Mail size={12} /> {user.email}</p>
            <p className={`text-[11px] font-mono mt-1 uppercase ${
              status === 'verified' ? 'text-moss-ink' : status === 'failed' ? 'text-coral-ink' : 'text-yellow-ink'
            }`}>{status.replace('_', ' ')}</p>
            {user.isSeed && <p className="text-[11px] text-ink-soft mt-1">Demo/seed account</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-moss-bg border border-moss-ink/30 rounded-md p-3 text-center">
            <p className="font-mono font-semibold text-moss-ink">{trust?.trustScore ?? user.trustScore ?? '—'}</p>
            <p className="text-[10.5px] text-moss-ink/80 mt-0.5">Trust 0–100</p>
          </div>
          <div className="bg-yellow-bg border border-yellow-ink/30 rounded-md p-3 text-center">
            <p className="font-mono font-semibold text-yellow-ink">{user.rating} <Star size={11} className="inline fill-yellow-ink -mt-0.5" /></p>
            <p className="text-[10.5px] text-yellow-ink/80 mt-0.5">{user.reviewCount} reviews</p>
          </div>
          <div className="bg-sky-bg border border-sky-ink/30 rounded-md p-3 text-center">
            <p className="font-mono font-semibold text-sky-ink">{user.listingsCount}</p>
            <p className="text-[10.5px] text-sky-ink/80 mt-0.5">Listings</p>
          </div>
        </div>
        <p className="text-[11px] text-ink-soft mt-3">Trust score is accumulated reliability, not a guarantee. It is separate from listing fraud risk.</p>
      </div>

      <div className="mt-6 bg-white border-[1.5px] border-ink rounded-md p-4">
        <div className="flex items-center gap-2 mb-2">
          <MapPin size={16} />
          <h2 className="font-display font-semibold text-base">Nearby marketplace discovery</h2>
        </div>
        <p className="text-xs text-ink-soft mb-3">Off by default. Exact coordinates are never shown on listings.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => toggleLocation(e.target.checked)} />
          Enable nearby marketplace discovery
        </label>
        {locMsg && <p className="text-xs text-moss-ink mt-2">{locMsg}</p>}
      </div>

      <button onClick={logout} className="mt-4 inline-flex items-center gap-2 text-sm text-ink-soft">
        <LogOut size={14} /> Log out
      </button>

      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks size={16} />
          <h2 className="font-display font-semibold text-base">Recent reviews</h2>
        </div>
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white border border-ink/15 rounded-md p-3.5 flex gap-3">
              <div className="w-9 h-9 rounded-md bg-paper-card border border-ink flex items-center justify-center text-base shrink-0">{r.avatar}</div>
              <div>
                <p className="text-sm font-medium">{r.from}</p>
                <p className="text-xs text-ink-soft mt-0.5">{r.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
