import { Heart, MapPin } from 'lucide-react'
import WashiTape from './WashiTape'
import TrustBadge from './TrustBadge'

const bgMap = {
  sky: 'bg-sky-bg', coral: 'bg-coral-bg', yellow: 'bg-yellow-bg', moss: 'bg-moss-bg',
}
const iconInkMap = {
  sky: 'text-sky-ink', coral: 'text-coral-ink', yellow: 'text-yellow-ink', moss: 'text-moss-ink',
}

const rotations = [-2, 1.5, -1, 2, -1.5, 1]

export default function ProductCard({ item, index = 0, favorited, onToggleFavorite, onOpen }) {
  const Icon = item.icon
  const rotate = rotations[index % rotations.length]

  return (
    <div
      className="group relative bg-paper-card border-[1.5px] border-ink rounded-sm p-3 pb-4 cursor-pointer transition-transform duration-200 hover:-translate-y-1 hover:rotate-0"
      style={{ transform: `rotate(${rotate}deg)` }}
      onClick={() => onOpen(item)}
    >
      <WashiTape color={item.tape} rotate={rotate < 0 ? -6 : 6} className="-top-2.5 left-8" width={44} />

      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id) }}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white border border-ink/20 flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="Save to favorites"
      >
        <Heart size={13} className={favorited ? 'fill-tape-coral text-tape-coral' : 'text-ink-soft'} />
      </button>

      <div className={`h-28 rounded-[3px] border border-ink/70 flex items-center justify-center ${bgMap[item.bg]}`}>
        <Icon size={36} className={iconInkMap[item.bg]} strokeWidth={1.6} />
      </div>

      <div className="mt-2.5 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display font-semibold text-[13.5px] leading-tight">{item.title}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <MapPin size={11} />
          <span>{item.distanceLabel || item.location}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="font-mono text-[12.5px] font-semibold text-coral-ink">
            {item.type === 'lend' ? `₹${item.price}/${item.lendUnit}` : `₹${item.price}`}
          </span>
          <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full border ${
            item.type === 'buy' ? 'bg-sky-bg text-sky-ink border-sky-ink/30' : 'bg-yellow-bg text-yellow-ink border-yellow-ink/30'
          }`}>
            {item.type === 'buy' ? 'buy' : 'borrow'}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t border-line mt-1.5">
          <span className="text-[10.5px] text-ink-soft">{item.condition}</span>
          <TrustBadge trust={item.seller.trust} trustScore={item.seller.trustScore} compact />
        </div>
      </div>
    </div>
  )
}
