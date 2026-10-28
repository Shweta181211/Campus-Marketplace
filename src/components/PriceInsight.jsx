import { useState } from 'react'
import { Sparkles, ChevronDown } from 'lucide-react'

export default function PriceInsight({ fairMin, fairMax, price, confidence, explanation, unavailable, recommendedPrice, usedTypicalMrp, source, comparables }) {
  const [showWhy, setShowWhy] = useState(false)

  if (unavailable) {
    return (
      <div className="bg-yellow-bg border-[1.5px] border-yellow-ink/40 rounded-md p-4">
        <div className="flex items-center gap-2 font-display font-semibold text-sm text-yellow-ink mb-1">
          <Sparkles size={15} />
          AI price insight
        </div>
        <p className="text-sm text-ink-soft">AI price recommendation temporarily unavailable.</p>
      </div>
    )
  }

  const min = Math.max(0, Math.round(Number(fairMin) || 0))
  const max = Math.max(min, Math.round(Number(fairMax) || 0))
  const rec = Math.max(0, Math.round(Number(recommendedPrice) || 0))
  const ask = Math.max(0, Math.round(Number(price) || rec || 0))

  let status = 'Fairly priced'
  let statusColor = 'moss'
  if (ask > max * 1.1) { status = 'Priced above estimate'; statusColor = 'coral' }
  else if (max > 0 && ask < min * 0.85) { status = 'Priced below estimate'; statusColor = 'sky' }

  const colorClasses = {
    moss: 'bg-moss-bg text-moss-ink border-moss-ink/30',
    coral: 'bg-coral-bg text-coral-ink border-coral-ink/30',
    sky: 'bg-sky-bg text-sky-ink border-sky-ink/30',
  }

  const range = Math.max(1, max - min)
  const clamped = Math.min(Math.max(ask || min, min - range * 0.3), max + range * 0.3)
  const pct = ((clamped - (min - range * 0.3)) / (range * 1.6)) * 100

  return (
    <div className="bg-yellow-bg border-[1.5px] border-yellow-ink/40 rounded-md p-4">
      <div className="flex items-center gap-2 font-display font-semibold text-sm text-yellow-ink mb-3">
        <Sparkles size={15} />
        AI Price Insight
      </div>
      <p className="text-sm mb-1 flex items-center gap-2">
        AI-estimated fair price
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-yellow-ink/30 bg-white">
          {source === 'ml' ? 'ML model' : 'formula estimate'}
        </span>
      </p>
      <p className="font-mono font-semibold text-lg">
        ₹{min} – ₹{max}
      </p>
      {rec > 0 ? (
        <p className="text-xs text-ink-soft mt-0.5">Suggested asking ₹{rec}</p>
      ) : null}
      {comparables ? (
        <p className="text-xs text-ink-soft mt-2">
          Similar items on campus: median ₹{comparables.median} (middle half ₹{comparables.p25}–₹{comparables.p75}, {comparables.count} listings)
        </p>
      ) : null}
      {usedTypicalMrp ? (
        <p className="text-xs text-coral-ink mt-2">Original/MRP looks too low, so this range uses a typical campus price for this category/item.</p>
      ) : null}

      <div className="flex items-center justify-between text-xs font-mono mb-1.5 mt-3">
        <span className="text-ink-soft">₹{min}</span>
        <span className="text-ink-soft">₹{max}</span>
      </div>
      <div className="relative h-2.5 bg-white rounded-full border border-ink/15 mb-1">
        <div className="absolute inset-y-0 bg-tape-moss/50 rounded-full" style={{ left: '15%', right: '15%' }} />
        <div className="absolute -top-1 w-4 h-4 rounded-full bg-ink border-2 border-white shadow" style={{ left: `calc(${pct}% - 8px)` }} />
      </div>
      <p className="text-[11px] text-ink-soft mb-3">Not guaranteed market value — you choose the asking price.</p>

      <div className="flex items-center justify-between">
        <span className={`text-xs font-mono font-medium px-2.5 py-1 rounded-full border ${colorClasses[statusColor]}`}>
          {status}
        </span>
        <span className="text-xs text-ink-soft font-mono">Confidence: {confidence ?? '—'}%</span>
      </div>

      <button onClick={() => setShowWhy((s) => !s)} className="flex items-center gap-1 text-xs font-medium text-yellow-ink mt-3 hover:underline">
        Why? <ChevronDown size={13} className={`transition-transform ${showWhy ? 'rotate-180' : ''}`} />
      </button>
      {showWhy && (
        <p className="text-xs text-ink-soft mt-2 leading-relaxed">
          {explanation || 'Estimated using item category, original price, condition, age and similar campus listings.'}
        </p>
      )}
    </div>
  )
}
