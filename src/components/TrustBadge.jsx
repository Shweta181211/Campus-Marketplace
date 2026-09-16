import { ShieldCheck, Star } from 'lucide-react'

export default function TrustBadge({ trust, trustScore, verified, compact = false }) {
  const label = trustScore != null ? `${Math.round(trustScore)}` : Number(trust || 0).toFixed(1)
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-moss-ink bg-moss-bg border border-moss-ink/30 px-2 py-0.5 rounded-full">
        <Star size={11} className="fill-moss-ink" />
        {label}
      </span>
    )
  }
  return (
    <div className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-moss-ink bg-moss-bg border border-moss-ink/30 px-2.5 py-1 rounded-full">
      {verified ? <ShieldCheck size={13} /> : <Star size={13} className="fill-moss-ink" />}
      <span>{trustScore != null ? `${Math.round(trustScore)}/100 trust` : `${label} trust score`}</span>
      {verified && <span className="opacity-70">· verified</span>}
    </div>
  )
}
