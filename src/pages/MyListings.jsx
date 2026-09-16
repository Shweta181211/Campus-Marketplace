import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Eye, MessageCircle } from 'lucide-react'
import { hydrateListings } from '../data/mockData'
import { api } from '../api'

export default function MyListings({ myListings, onOpenProduct }) {
  const navigate = useNavigate()
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .getMyListings()
      .then((data) => {
        if (!cancelled) setMine(hydrateListings(data))
      })
      .catch(() => {
        if (!cancelled) setMine([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [myListings])

  const display = mine.length ? mine : hydrateListings(myListings)

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl mb-1">My listings</h1>
          <p className="text-sm text-ink-soft">Manage what you're selling or lending on campus</p>
        </div>
        <button
          onClick={() => navigate('/sell-lend')}
          className="hidden sm:inline-flex items-center gap-1.5 bg-ink text-paper rounded-full px-4 py-2.5 text-sm font-medium hover:opacity-90"
        >
          <Plus size={15} /> New listing
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-soft">Loading your listings...</p>
      ) : display.length === 0 ? (
        <p className="text-sm text-ink-soft">No listings yet. Publish one from Sell / Lend.</p>
      ) : (
        <div className="space-y-3">
          {display.map((item, i) => (
            <div key={item.id ?? `new-${i}`} className="bg-paper-card border-[1.5px] border-ink rounded-md p-3.5 flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-[3px] border border-ink/60 bg-white flex items-center justify-center shrink-0"
                style={{ transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)` }}
              >
                {item.icon ? <item.icon size={26} strokeWidth={1.6} /> : <Plus size={20} className="text-ink-soft" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.title}</p>
                <p className="text-xs text-ink-soft mt-0.5">
                  {item.type === 'lend' || item.listingType === 'lend' ? 'Lending' : 'Selling'} · ₹{item.price}
                  {(item.type === 'lend' || item.listingType === 'lend') && `/${item.lendUnit || 'day'}`}
                </p>
                <span className="inline-block text-[10.5px] font-mono mt-1.5 px-2 py-0.5 rounded-full bg-moss-bg text-moss-ink border border-moss-ink/30">
                  {item.status || 'active'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-ink-soft text-xs shrink-0">
                <span className="flex items-center gap-1"><Eye size={13} /> {item.views ?? 12 + i * 4}</span>
                <span className="flex items-center gap-1"><MessageCircle size={13} /> {item.messageCount ?? i + 1}</span>
              </div>
              {item.icon && (
                <button
                  onClick={() => onOpenProduct(item)}
                  className="shrink-0 text-xs font-medium border-[1.5px] border-ink rounded-full px-3 py-1.5 hover:bg-white"
                >
                  View
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => navigate('/sell-lend')}
        className="sm:hidden w-full mt-6 inline-flex items-center justify-center gap-1.5 bg-ink text-paper rounded-full px-4 py-3 text-sm font-medium"
      >
        <Plus size={15} /> New listing
      </button>
    </div>
  )
}
