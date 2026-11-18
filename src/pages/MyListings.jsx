import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Eye, MessageCircle, MapPin } from 'lucide-react'
import { hydrateListings } from '../data/mockData'
import { api } from '../api'
import { getBrowserPosition, thumb } from '../utils/geo'

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

  const [note, setNote] = useState('')

  const refresh = () => api.getMyListings().then((d) => setMine(hydrateListings(d))).catch(() => {})

  const toggleLocation = async (item) => {
    setNote('')
    try {
      if (item.locationShared) {
        await api.setListingLocation(item.id, { share: false })
      } else {
        const pos = await getBrowserPosition()
        await api.setListingLocation(item.id, { share: true, ...pos })
      }
      await refresh()
    } catch (err) {
      setNote(err.message)
    }
  }

  const removeListing = async (item) => {
    if (!window.confirm(`Remove "${item.title}"? Its photos will be deleted too.`)) return
    try {
      await api.deleteListing(item.id)
      await refresh()
    } catch (err) {
      setNote(err.message)
    }
  }

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
          {note && <p className="text-xs text-coral-ink">{note}</p>}
          {display.map((item, i) => (
            <div key={item.id ?? `new-${i}`} className="bg-paper-card border-[1.5px] border-ink rounded-md p-3.5 flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-[3px] border border-ink/60 bg-white flex items-center justify-center shrink-0 overflow-hidden"
                style={{ transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)` }}
              >
                {item.images?.[0] ? (
                  <img src={thumb(item.images[0], 160)} alt="" className="w-full h-full object-cover" />
                ) : item.icon ? <item.icon size={26} strokeWidth={1.6} /> : <Plus size={20} className="text-ink-soft" />}
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
              {item.id && item.status !== 'sold' && (
                <div className="shrink-0 flex flex-col gap-1.5 items-end">
                  <button onClick={() => toggleLocation(item)} className="text-[11px] border border-ink/40 rounded-full px-2.5 py-1 inline-flex items-center gap-1 hover:bg-white">
                    <MapPin size={11} /> {item.locationShared ? 'Stop sharing location' : 'Share approx. location'}
                  </button>
                  <button onClick={() => removeListing(item)} className="text-[11px] text-ink-soft hover:text-coral-ink">Remove</button>
                </div>
              )}
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
