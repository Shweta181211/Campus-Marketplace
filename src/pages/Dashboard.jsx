import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, PackagePlus, MapPin, Clock } from 'lucide-react'
import WashiTape from '../components/WashiTape'
import { categories } from '../data/mockData'
import { hydrateListings } from '../data/mockData'
import { api } from '../api'
import { useAuth } from '../auth'

const bgMap = { sky: 'bg-sky-bg', coral: 'bg-coral-bg', yellow: 'bg-yellow-bg', moss: 'bg-moss-bg' }

export default function Dashboard({ favorites: _favorites, onToggleFavorite: _onToggleFavorite, onOpenProduct }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [recent, setRecent] = useState([])
  const [nearby, setNearby] = useState([])
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .getListings({ sort: 'recent' })
      .then((data) => {
        if (!cancelled) setRecent(hydrateListings(data).slice(0, 8))
      })
      .catch(() => {
        if (!cancelled) setRecent([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    api.getNearby().then((data) => { if (!cancelled) setNearby(hydrateListings(data).slice(0, 6)) }).catch(() => {})
    api.getTransactions().then((data) => { if (!cancelled) setLoans(data) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-12">
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-ink-soft mb-1">Good to see you, {user?.name?.split(' ')[0] || 'there'}</p>
        <h1 className="font-display font-bold text-2xl md:text-3xl">What are you up to today?</h1>
      </div>

      <div className="grid sm:grid-cols-2 gap-8 md:gap-12 pt-2">
        <button
          onClick={() => navigate('/buy-borrow')}
          className="group relative bg-paper-card border-[1.5px] border-ink rounded-md p-6 text-left transition-transform duration-200 hover:-translate-y-1"
          style={{ transform: 'rotate(-1.5deg)' }}
        >
          <WashiTape color="sky" rotate={-8} className="-top-3 left-10" width={64} />
          <div className="w-14 h-14 rounded-md bg-sky-bg border border-ink/70 flex items-center justify-center mb-4">
            <ShoppingBag size={26} className="text-sky-ink" strokeWidth={1.7} />
          </div>
          <h2 className="font-display font-bold text-xl mb-1">Buy / Borrow</h2>
          <p className="text-sm text-ink-soft mb-5">Find something you need on campus</p>
          <span className="inline-block font-mono text-xs bg-ink text-paper px-3.5 py-2 rounded-full group-hover:opacity-90">
            browse listings →
          </span>
        </button>

        <button
          onClick={() => navigate('/sell-lend')}
          className="group relative bg-paper-card border-[1.5px] border-ink rounded-md p-6 text-left transition-transform duration-200 hover:-translate-y-1"
          style={{ transform: 'rotate(1.5deg)' }}
        >
          <WashiTape color="coral" rotate={8} className="-top-3 right-10" width={64} />
          <div className="w-14 h-14 rounded-md bg-coral-bg border border-ink/70 flex items-center justify-center mb-4">
            <PackagePlus size={26} className="text-coral-ink" strokeWidth={1.7} />
          </div>
          <h2 className="font-display font-bold text-xl mb-1">Sell / Lend</h2>
          <p className="text-sm text-ink-soft mb-5">List something you no longer need</p>
          <span className="inline-block font-mono text-xs bg-ink text-paper px-3.5 py-2 rounded-full group-hover:opacity-90">
            list an item →
          </span>
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} />
          <h3 className="font-display font-semibold text-base">Borrowed / lent due dates</h3>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            { label: 'Borrowed', items: loans.filter((t) => String(t.borrowerId) === String(user?.id || user?._id) && !['COMPLETED', 'REJECTED', 'PAID'].includes(t.status)) },
            { label: 'Lent', items: loans.filter((t) => String(t.lenderId) === String(user?.id || user?._id) && !['COMPLETED', 'REJECTED', 'PAID'].includes(t.status)) },
            { label: 'Due soon', items: loans.filter((t) => t.status === 'DUE_SOON') },
            { label: 'Overdue', items: loans.filter((t) => t.status === 'OVERDUE' || t.overdueStatus) },
          ].map((col) => (
            <button key={col.label} onClick={() => navigate('/transactions')} className="bg-white border border-ink/20 rounded-md p-3 text-left">
              <p className="text-[11px] font-mono uppercase text-ink-soft">{col.label}</p>
              <p className="font-display font-bold text-xl">{col.items.length}</p>
              {col.items[0]?.remainingLabel && <p className="text-[11px] text-ink-soft mt-1 truncate">{col.items[0].item}: {col.items[0].remainingLabel}</p>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate('/buy-borrow', { state: { category: c.id } })}
              className="shrink-0 flex flex-col items-center gap-2 group"
            >
              <div className={`w-14 h-14 rounded-full border-[1.5px] border-ink flex items-center justify-center bg-white group-hover:-translate-y-0.5 transition-transform`}>
                <c.icon size={22} strokeWidth={1.7} />
              </div>
              <span className="text-xs font-medium text-ink-soft">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-base">Recently listed</h3>
          <button onClick={() => navigate('/buy-borrow')} className="text-xs font-mono text-ink-soft hover:text-ink underline underline-offset-2">
            view all
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-ink-soft">Loading listings from MongoDB...</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-3">
            {recent.map((item, i) => (
              <button
                key={item.id}
                onClick={() => onOpenProduct(item)}
                className="shrink-0 w-40 bg-paper-card border-[1.5px] border-ink rounded-sm p-2.5"
                style={{ transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 1.5}deg)` }}
              >
                <div className={`h-20 rounded-[3px] border border-ink/60 flex items-center justify-center ${bgMap[item.bg]}`}>
                  <item.icon size={26} strokeWidth={1.6} />
                </div>
                <p className="text-xs font-medium mt-2 text-left truncate">{item.title}</p>
                <p className="font-mono text-xs text-coral-ink text-left mt-0.5">
                  {item.type === 'lend' ? `₹${item.price}/${item.lendUnit}` : `₹${item.price}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={16} />
          <h3 className="font-display font-semibold text-base">Nearby on campus</h3>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {(nearby.length ? nearby : []).map((item) => (
            <button key={item.id} onClick={() => onOpenProduct(item)} className="bg-white border border-ink/20 rounded-md p-4 text-left">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-ink-soft">{item.distanceLabel || 'Nearby (approx.)'}</p>
            </button>
          ))}
          {!nearby.length && (
            <p className="text-sm text-ink-soft col-span-3">Nearby discovery is off by default. Enable it in Profile to see approximate distances.</p>
          )}
        </div>
      </div>
    </div>
  )
}
