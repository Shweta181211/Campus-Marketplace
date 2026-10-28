import { useState, useMemo, useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import CategoryDropdown from '../components/CategoryDropdown'
import FilterPanel from '../components/FilterPanel'
import ProductGrid from '../components/ProductGrid'
import { hydrateListings } from '../data/mockData'
import { api } from '../api'

export default function BuyBorrow({ search, favorites, onToggleFavorite, onOpenProduct }) {
  const routerLocation = useLocation()
  const [mode, setMode] = useState('buy') // buy | borrow
  const [category, setCategory] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ condition: '', maxPrice: 50000, nearby: false, sort: 'recent', radiusKm: 3 })
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (routerLocation.state?.category) setCategory(routerLocation.state.category)
  }, [routerLocation.state])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const wantNearby = filters.nearby || filters.sort === 'nearby'
    const loader = api.getListings({
      type: mode === 'buy' ? 'buy' : 'lend',
      category: category || undefined,
      search: search || undefined,
      condition: filters.condition || undefined,
      maxPrice: filters.maxPrice,
      sort: filters.sort,
      ...(wantNearby ? { nearby: 'true', radiusKm: filters.radiusKm } : {}),
    })
    loader
      .then((data) => {
        if (!cancelled) setListings(hydrateListings(data))
      })
      .catch((err) => {
        if (!cancelled) {
          setListings([])
          setError(err.message || 'Failed to load listings')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [mode, category, search, filters.condition, filters.maxPrice, filters.sort, filters.nearby, filters.radiusKm])

  const filtered = useMemo(() => {
    let items = listings
    if (filters.maxPrice) items = items.filter((i) => Number(i.price) <= Number(filters.maxPrice))
    if (category) items = items.filter((i) => i.category === category)
    if (mode === 'buy') items = items.filter((i) => i.type === 'buy' || i.type === 'sale')
    if (mode === 'borrow') items = items.filter((i) => i.type === 'lend' || i.type === 'borrow')
    return items
  }, [listings, filters.maxPrice, category, mode])

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
      <h1 className="font-display font-bold text-2xl mb-1">Buy / Borrow</h1>
      <p className="text-sm text-ink-soft mb-6">{search ? `Results for "${search}"` : 'Find something you need on campus'}</p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="inline-flex bg-white border-[1.5px] border-ink rounded-full p-1">
          {['buy', 'borrow'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                mode === m ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <CategoryDropdown value={category} onChange={setCategory} />

        <button
          onClick={() => setShowFilters((s) => !s)}
          className="lg:hidden inline-flex items-center gap-2 bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2 text-sm font-medium"
        >
          <SlidersHorizontal size={15} />
          Filters
        </button>

        {category && (
          <button
            onClick={() => setCategory('')}
            className="inline-flex items-center gap-1 text-xs font-mono bg-yellow-bg text-yellow-ink border border-yellow-ink/30 px-2.5 py-1.5 rounded-full"
          >
            {category} <X size={12} />
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        <div className="hidden lg:block">
          <FilterPanel filters={filters} setFilters={setFilters} />
        </div>

        {showFilters && (
          <div className="lg:hidden mb-2">
            <FilterPanel filters={filters} setFilters={setFilters} />
          </div>
        )}

        {loading ? (
          <p className="text-sm text-ink-soft py-10">Loading from MongoDB...</p>
        ) : error ? (
          <div className="py-10 text-sm">
            <p className="text-coral-ink">{error}</p>
            {/nearby|location/i.test(error) && (
              <p className="text-ink-soft mt-2">Nearby search is optional and off by default. <Link to="/profile" className="underline">Turn it on in Profile</Link> or untick “Nearby only”.</p>
            )}
          </div>
        ) : (
          <ProductGrid
            items={filtered}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onOpen={onOpenProduct}
          />
        )}
      </div>
    </div>
  )
}
