import { useState } from 'react'
import { MapPin, MessageCircle, Sparkles, Flag, BellRing, Heart } from 'lucide-react'
import { thumb } from '../utils/geo'
import { api } from '../api'
import Avatar from './Avatar'
import TrustBadge from './TrustBadge'
import WashiTape from './WashiTape'

const bgMap = { sky: 'bg-sky-bg', coral: 'bg-coral-bg', yellow: 'bg-yellow-bg', moss: 'bg-moss-bg' }
const iconInkMap = { sky: 'text-sky-ink', coral: 'text-coral-ink', yellow: 'text-yellow-ink', moss: 'text-moss-ink' }

const REPORT_CATEGORIES = [
  ['scam', 'Scam / asks for advance payment'],
  ['fake_listing', 'Fake or misleading listing'],
  ['prohibited_item', 'Prohibited item'],
  ['spam', 'Spam / duplicate posts'],
  ['harassment', 'Harassment'],
  ['other', 'Something else'],
]

export default function ProductDetails({ item, onRequestAction, actionLabel, watching = false, onToggleWatch, isOwner = false }) {
  const Icon = item.icon
  const [shot, setShot] = useState(0)
  const [reporting, setReporting] = useState(false)
  const [report, setReport] = useState({ category: 'scam', reason: '' })
  const [reportMsg, setReportMsg] = useState('')
  const [alertType, setAlertType] = useState('any')
  const [alertValue, setAlertValue] = useState(10)
  const [alertMsg, setAlertMsg] = useState('')

  const submitReport = async (e) => {
    e.preventDefault()
    try {
      const r = await api.report({ targetType: 'listing', listingId: item.id, category: report.category, reason: report.reason || report.category })
      setReportMsg(r.message || 'Report sent')
      setReporting(false)
    } catch (err) {
      setReportMsg(err.message)
    }
  }

  const saveAlert = async () => {
    try {
      if (!watching) await onToggleWatch?.(item.id)
      await api.updateWatch(item.id, { alertEnabled: true, thresholdType: alertType, thresholdValue: alertType === 'any' ? 0 : Number(alertValue) })
      setAlertMsg(alertType === 'any' ? 'You will be alerted on any price drop.' : `Alert when the price drops by ${alertType === 'percent' ? `${alertValue}%` : `₹${alertValue}`} or more.`)
    } catch (err) {
      setAlertMsg(err.message)
    }
  }
  const photos = item.images || []

  let status = 'Fairly priced', statusColor = 'moss'
  if (item.price > item.fairMax * 1.1) { status = 'Priced above market'; statusColor = 'coral' }
  else if (item.price < item.fairMin * 0.85) { status = 'Priced below market'; statusColor = 'sky' }
  const colorClasses = {
    moss: 'bg-moss-bg text-moss-ink border-moss-ink/30',
    coral: 'bg-coral-bg text-coral-ink border-coral-ink/30',
    sky: 'bg-sky-bg text-sky-ink border-sky-ink/30',
  }

  return (
    <div className="p-5 md:p-6">
      <div className={`relative h-56 md:h-64 rounded-md border-[1.5px] border-ink flex items-center justify-center overflow-hidden ${bgMap[item.bg]}`}>
        <WashiTape color={item.tape} className="-top-2.5 left-10 z-10" rotate={-6} width={50} />
        {photos.length ? (
          <img src={thumb(photos[Math.min(shot, photos.length - 1)], 900)} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <Icon size={64} strokeWidth={1.4} className={iconInkMap[item.bg]} />
        )}
        <span className={`absolute bottom-3 left-3 text-[11px] font-mono font-medium px-2.5 py-1 rounded-full border ${
          item.type === 'buy' ? 'bg-white text-sky-ink border-sky-ink/30' : 'bg-white text-yellow-ink border-yellow-ink/30'
        }`}>
          {item.type === 'buy' ? 'for sale' : 'for borrow'}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto">
          {photos.map((u, i) => (
            <button key={u} type="button" onClick={() => setShot(i)} className={`shrink-0 w-14 h-14 rounded-[3px] overflow-hidden border-[1.5px] ${i === shot ? 'border-ink' : 'border-ink/20'}`}>
              <img src={thumb(u, 120)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">{item.title}</h2>
          <div className="flex items-center gap-1.5 text-xs text-ink-soft mt-1">
            <MapPin size={12} />
            {item.distanceLabel || (item.locationShared ? 'Nearby (distance shown after you enable location)' : item.location)}
          </div>
        </div>
        <span className="font-mono text-xl font-semibold text-coral-ink whitespace-nowrap">
          {item.type === 'lend' ? `₹${item.price}/${item.lendUnit}` : `₹${item.price}`}
        </span>
      </div>

      <div className="flex gap-2 mt-3">
        <span className="text-xs font-mono px-2.5 py-1 rounded-full border border-ink/20 bg-white">{item.condition}</span>
        <span className="text-xs font-mono px-2.5 py-1 rounded-full border border-ink/20 bg-white capitalize">{item.category}</span>
      </div>

      <p className="text-sm text-ink-soft leading-relaxed mt-4">{item.description}</p>

      {item.fraudRiskLevel && item.fraudRiskLevel !== 'LOW' && (
        <p className="text-xs mt-3 px-2.5 py-1.5 rounded-md border bg-yellow-bg text-yellow-ink border-yellow-ink/30">
          Fraud risk {item.fraudRiskLevel} ({item.fraudRiskScore}){item.fraudDecision === 'verified' ? ' · seller completed extra verification' : ''}
          {item.fraudDecision === 'approved' ? ' · reviewed and approved by an admin' : ''}. This is a screening signal, not an accusation.
        </p>
      )}
      <p className="text-[11px] text-ink-soft mt-2">Safety tip: meet on campus, check the item first and never pay in advance outside the app.</p>


      <div className="bg-yellow-bg border-[1.5px] border-yellow-ink/40 rounded-md p-3.5 mt-5">
        <div className="flex items-center gap-2 font-display font-semibold text-xs text-yellow-ink mb-1.5">
          <Sparkles size={13} />
          AI price insight
        </div>
        <p className="text-xs text-ink-soft">
          Estimated fair price: <span className="font-mono font-medium text-ink">₹{item.fairMin} – ₹{item.fairMax}</span>
        </p>
        <p className="text-xs text-ink-soft">
          Listed price: <span className="font-mono font-medium text-ink">₹{item.price}</span>
        </p>
        <span className={`inline-block text-[11px] font-mono font-medium mt-2 px-2 py-0.5 rounded-full border ${colorClasses[statusColor]}`}>
          {statusColor === 'moss' ? '✓ ' : ''}{status} · {item.confidence}% confidence
        </span>
      </div>

      <div className="border-t border-line mt-5 pt-4 flex items-center gap-3">
        <Avatar emoji={item.seller.avatar} config={item.seller.avatarConfig} size="md" rotate={-3} />
        <div className="flex-1">
          <p className="font-medium text-sm">{item.seller.name}</p>
          <TrustBadge trust={item.seller.trust} trustScore={item.seller.trustScore} verified={item.seller.verified} />
        </div>
      </div>

      {!isOwner && item.type === 'buy' && (
        <div className="mt-4 bg-sky-bg border border-sky-ink/30 rounded-md p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-sky-ink mb-2">
            <BellRing size={13} /> Price-drop alert
            {onToggleWatch && (
              <button type="button" onClick={() => onToggleWatch(item.id)} className="ml-auto inline-flex items-center gap-1 text-[11px] border border-sky-ink/40 rounded-full px-2 py-0.5 bg-white">
                <Heart size={11} className={watching ? 'fill-coral-ink text-coral-ink' : ''} /> {watching ? 'Watching' : 'Watch'}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={alertType} onChange={(e) => setAlertType(e.target.value)} className="bg-white border border-ink/30 rounded-md px-2 py-1">
              <option value="any">Any drop</option>
              <option value="percent">Drop of at least %</option>
              <option value="amount">Drop of at least ₹</option>
            </select>
            {alertType !== 'any' && (
              <input type="number" min="1" value={alertValue} onChange={(e) => setAlertValue(e.target.value)} className="w-20 bg-white border border-ink/30 rounded-md px-2 py-1" />
            )}
            <button type="button" onClick={saveAlert} className="bg-ink text-paper rounded-full px-3 py-1">Save alert</button>
          </div>
          {alertMsg && <p className="text-[11px] text-sky-ink mt-1.5">{alertMsg}</p>}
        </div>
      )}

      <div className="flex gap-3 mt-5">
        <button
          onClick={() => onRequestAction('chat')}
          className="flex-1 flex items-center justify-center gap-2 border-[1.5px] border-ink rounded-full py-2.5 text-sm font-medium hover:bg-paper transition-colors"
        >
          <MessageCircle size={16} />
          Chat with seller
        </button>
        <button
          onClick={() => onRequestAction('action')}
          className="flex-1 bg-ink text-paper rounded-full py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {actionLabel}
        </button>
      </div>
      {!isOwner && (
        <div className="mt-4 text-right">
          {reporting ? (
            <form onSubmit={submitReport} className="text-left bg-white border border-ink/20 rounded-md p-3 space-y-2">
              <p className="text-xs font-medium">Report this listing to the admin team</p>
              <select value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value })} className="w-full text-xs bg-white border border-ink/30 rounded-md px-2 py-1">
                {REPORT_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <textarea value={report.reason} onChange={(e) => setReport({ ...report, reason: e.target.value })} rows={2} placeholder="What happened? (optional)" className="w-full text-xs bg-white border border-ink/30 rounded-md px-2 py-1" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setReporting(false)} className="text-xs text-ink-soft px-2">Cancel</button>
                <button className="text-xs bg-coral-ink text-white rounded-full px-3 py-1">Send report</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setReporting(true)} className="text-[11px] text-ink-soft hover:text-coral-ink inline-flex items-center gap-1">
              <Flag size={11} /> Report listing
            </button>
          )}
          {reportMsg && <p className="text-[11px] text-ink-soft mt-1">{reportMsg}</p>}
        </div>
      )}
    </div>
  )
}
