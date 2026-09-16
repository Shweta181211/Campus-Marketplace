import { MapPin, MessageCircle, Sparkles } from 'lucide-react'
import Avatar from './Avatar'
import TrustBadge from './TrustBadge'
import WashiTape from './WashiTape'

const bgMap = { sky: 'bg-sky-bg', coral: 'bg-coral-bg', yellow: 'bg-yellow-bg', moss: 'bg-moss-bg' }
const iconInkMap = { sky: 'text-sky-ink', coral: 'text-coral-ink', yellow: 'text-yellow-ink', moss: 'text-moss-ink' }

export default function ProductDetails({ item, onRequestAction, actionLabel }) {
  const Icon = item.icon

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
      <div className={`relative h-56 md:h-64 rounded-md border-[1.5px] border-ink flex items-center justify-center ${bgMap[item.bg]}`}>
        <WashiTape color={item.tape} className="-top-2.5 left-10" rotate={-6} width={50} />
        <Icon size={64} strokeWidth={1.4} className={iconInkMap[item.bg]} />
        <span className={`absolute bottom-3 left-3 text-[11px] font-mono font-medium px-2.5 py-1 rounded-full border ${
          item.type === 'buy' ? 'bg-white text-sky-ink border-sky-ink/30' : 'bg-white text-yellow-ink border-yellow-ink/30'
        }`}>
          {item.type === 'buy' ? 'for sale' : 'for borrow'}
        </span>
      </div>

      <div className="mt-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-xl">{item.title}</h2>
          <div className="flex items-center gap-1.5 text-xs text-ink-soft mt-1">
            <MapPin size={12} />
            {item.distanceLabel || item.location}
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
          Fraud risk {item.fraudRiskLevel} ({item.fraudRiskScore}). This is a screening signal, not an accusation.
        </p>
      )}


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
        <Avatar emoji={item.seller.avatar} size="md" rotate={-3} />
        <div className="flex-1">
          <p className="font-medium text-sm">{item.seller.name}</p>
          <TrustBadge trust={item.seller.trust} trustScore={item.seller.trustScore} verified={item.seller.verified} />
        </div>
      </div>

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
    </div>
  )
}
