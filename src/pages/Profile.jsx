import { useEffect, useState } from 'react'
import { ShieldCheck, Star, ListChecks, Mail, MapPin, LogOut, Pencil, Gauge, Flag } from 'lucide-react'
import Avatar from '../components/Avatar'
import AvatarBuilder from '../components/AvatarBuilder'
import WashiTape from '../components/WashiTape'
import { api } from '../api'
import { useAuth } from '../auth'
import { getBrowserPosition } from '../utils/geo'

export default function Profile() {
  const { user, refresh, logout } = useAuth()
  const [reviews, setReviews] = useState([])
  const [trust, setTrust] = useState(null)
  const [locMsg, setLocMsg] = useState('')
  const [enabled, setEnabled] = useState(Boolean(user?.locationSharingEnabled))
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [editingInfo, setEditingInfo] = useState(false)
  const [form, setForm] = useState({ name: user?.name || '', hostel: user?.hostel || '' })
  const [infoMsg, setInfoMsg] = useState('')
  const [myReports, setMyReports] = useState([])

  useEffect(() => {
    api.myReports().then(setMyReports).catch(() => setMyReports([]))
  }, [])

  const saveInfo = async (e) => {
    e.preventDefault()
    try {
      await api.updateProfile(form)
      await refresh()
      setEditingInfo(false)
      setInfoMsg('Profile updated')
    } catch (err) {
      setInfoMsg(err.message)
    }
  }

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

  const updateLocation = async () => {
    try {
      const pos = await getBrowserPosition()
      await api.setLocation({ ...pos, label: 'Approximate campus area' })
      setLocMsg('Location updated.')
      await refresh()
    } catch (err) {
      setLocMsg(err.message)
    }
  }

  const stopAllListings = async () => {
    try {
      await api.clearAllListingLocations()
      setLocMsg('Location sharing switched off on all your listings.')
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
          <button type="button" onClick={() => setEditingAvatar((v) => !v)} className="relative group" title="Edit avatar">
            <Avatar emoji={user.avatar} config={user.avatarConfig} size="xl" rotate={-3} />
            <span className="absolute -bottom-1 -right-1 bg-ink text-paper rounded-full p-1"><Pencil size={11} /></span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-xl">{user.name}</h1>
              {user.verified && <ShieldCheck size={18} className="text-moss-ink" />}
            </div>
            <p className="text-xs text-ink-soft flex items-center gap-1.5 mt-1"><Mail size={12} /> {user.email}</p>
            <p className={`text-[11px] font-mono mt-1 uppercase ${
              status === 'verified' ? 'text-moss-ink' : status === 'failed' ? 'text-coral-ink' : 'text-yellow-ink'
            }`}>{status.replace('_', ' ')}</p>
            {user.hostel && <p className="text-[11px] text-ink-soft mt-0.5">{user.hostel}</p>}
            {user.isSeed && <p className="text-[11px] text-ink-soft mt-1">Demo/seed account</p>}
            <button type="button" onClick={() => { setForm({ name: user.name, hostel: user.hostel || '' }); setEditingInfo((v) => !v) }} className="text-[11px] underline text-ink-soft mt-1">
              Edit name / hostel
            </button>
          </div>
        </div>

        {editingInfo && (
          <form onSubmit={saveInfo} className="mt-4 flex flex-wrap gap-2 items-end">
            <label className="text-[11px] text-ink-soft">Display name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="block bg-white border-[1.5px] border-ink rounded-md px-2 py-1 text-sm" />
            </label>
            <label className="text-[11px] text-ink-soft">Hostel
              <input value={form.hostel} onChange={(e) => setForm({ ...form, hostel: e.target.value })} className="block bg-white border-[1.5px] border-ink rounded-md px-2 py-1 text-sm" />
            </label>
            <button className="bg-ink text-paper rounded-full px-3 py-1.5 text-xs">Save</button>
          </form>
        )}
        {infoMsg && <p className="text-xs text-ink-soft mt-2">{infoMsg}</p>}

        {editingAvatar && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs text-ink-soft mb-3">Build your campus identity from parts — no real photo needed.</p>
            <AvatarBuilder
              initial={user.avatarConfig}
              onCancel={() => setEditingAvatar(false)}
              onSaved={async () => { await refresh(); setEditingAvatar(false) }}
            />
          </div>
        )}

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

      {trust?.components && <TrustBreakdown trust={trust} />}

      {myReports.length > 0 && (
        <div className="mt-6 bg-white border-[1.5px] border-ink rounded-md p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flag size={15} />
            <h2 className="font-display font-semibold text-base">Reports you filed</h2>
          </div>
          <ul className="space-y-1.5">
            {myReports.slice(0, 6).map((r) => (
              <li key={r.id} className="text-xs flex justify-between gap-3">
                <span className="truncate">{r.reason}</span>
                <span className={`font-mono shrink-0 ${r.status === 'confirmed' ? 'text-moss-ink' : r.status === 'dismissed' ? 'text-ink-soft' : 'text-yellow-ink'}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
        {enabled && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" onClick={updateLocation} className="text-xs border-[1.5px] border-ink rounded-full px-3 py-1">Update my location</button>
            <button type="button" onClick={stopAllListings} className="text-xs border-[1.5px] border-ink rounded-full px-3 py-1">Stop sharing on all my listings</button>
          </div>
        )}
        <p className="text-[11px] text-ink-soft mt-2">
          This only lets <em>you</em> search nearby. Sharing an item’s location is a separate choice you make per listing. Your stored location is deleted when you turn this off or after 7 days.
        </p>
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

const PARTS = [
  ['verification', 'Verified college email'],
  ['reviews', 'Reviews & rating'],
  ['completedTransactions', 'Completed transactions'],
  ['onTimeReturns', 'On-time returns'],
  ['accountAge', 'Account age'],
  ['negativeReports', 'Reports (confirmed weigh most)'],
]

function TrustBreakdown({ trust }) {
  const c = trust.contributions || {}
  const max = trust.weights || {}
  const maxFor = { verification: max.V, reviews: max.R, completedTransactions: max.C, onTimeReturns: max.O, accountAge: max.A, negativeReports: max.F }
  return (
    <div className="mt-6 bg-white border-[1.5px] border-ink rounded-md p-4">
      <div className="flex items-center gap-2 mb-1">
        <Gauge size={16} />
        <h2 className="font-display font-semibold text-base">How your trust score is calculated</h2>
      </div>
      <p className="text-xs text-ink-soft mb-1">
        <span className="font-mono font-semibold text-ink">{trust.trustScore}/100</span> · {trust.label}
      </p>
      <p className="text-[11px] font-mono text-ink-soft mb-3">{trust.formula}</p>
      <div className="space-y-2">
        {PARTS.map(([key, label]) => {
          const v = Number(c[key] || 0)
          const m = Number(maxFor[key] || 1)
          const neg = v < 0
          return (
            <div key={key}>
              <div className="flex justify-between text-[11px]">
                <span>{label}</span>
                <span className={`font-mono ${neg ? 'text-coral-ink' : 'text-moss-ink'}`}>{v > 0 ? '+' : ''}{v} / {neg ? '-' : ''}{m}</span>
              </div>
              <div className="h-1.5 bg-paper rounded-full overflow-hidden">
                <div className={`h-full ${neg ? 'bg-tape-coral' : 'bg-moss-ink/70'}`} style={{ width: `${Math.min(100, (Math.abs(v) / m) * 100)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      {trust.history?.length > 0 && (
        <details className="mt-3">
          <summary className="text-[11px] text-ink-soft cursor-pointer">Score history (audit trail)</summary>
          <ul className="mt-2 space-y-1">
            {trust.history.map((h, i) => (
              <li key={i} className="text-[11px] flex justify-between gap-2">
                <span className="text-ink-soft">{new Date(h.at).toLocaleDateString()} · {h.reason}</span>
                <span className="font-mono">{h.before ?? '—'} → {h.after}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[10.5px] text-ink-soft mt-3">{trust.disclaimer}</p>
    </div>
  )
}
