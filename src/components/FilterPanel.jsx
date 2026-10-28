import { SlidersHorizontal } from 'lucide-react'

const conditions = ['New', 'Like New', 'Good', 'Fair']
const sortOptions = [
  { id: 'recent', label: 'Recently listed' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'nearby', label: 'Nearby' },
]

export default function FilterPanel({ filters, setFilters }) {
  const toggleCondition = (c) => {
    setFilters((f) => ({
      ...f,
      condition: f.condition === c ? '' : c,
    }))
  }

  return (
    <div className="bg-paper-card border-[1.5px] border-ink rounded-sm p-4 space-y-5">
      <div className="flex items-center gap-2 font-display font-semibold text-sm">
        <SlidersHorizontal size={15} />
        Filters
      </div>

      <div>
        <p className="text-xs font-medium text-ink-soft mb-2 font-mono uppercase tracking-wide">Condition</p>
        <div className="flex flex-wrap gap-1.5">
          {conditions.map((c) => (
            <button
              key={c}
              onClick={() => toggleCondition(c)}
              className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                filters.condition === c
                  ? 'bg-ink text-paper border-ink'
                  : 'bg-white border-ink/25 hover:border-ink'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-ink-soft mb-2 font-mono uppercase tracking-wide">Max price: ₹{filters.maxPrice}</p>
        <input
          type="range"
          min="0"
          max="50000"
          step="100"
          value={filters.maxPrice}
          onChange={(e) => setFilters((f) => ({ ...f, maxPrice: Number(e.target.value) }))}
          className="w-full accent-tape-coral"
        />
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={filters.nearby}
          onChange={(e) => setFilters((f) => ({ ...f, nearby: e.target.checked }))}
          className="accent-tape-coral w-4 h-4"
        />
        Nearby only
      </label>
      {filters.nearby && (
        <div>
          <p className="text-xs font-medium text-ink-soft mb-2 font-mono uppercase tracking-wide">Within {filters.radiusKm || 3} km</p>
          <input
            type="range" min="0.5" max="10" step="0.5"
            value={filters.radiusKm || 3}
            onChange={(e) => setFilters((f) => ({ ...f, radiusKm: Number(e.target.value) }))}
            className="w-full accent-tape-coral"
          />
          <p className="text-[11px] text-ink-soft mt-1">Only items whose sellers chose to share location appear here.</p>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-ink-soft mb-2 font-mono uppercase tracking-wide">Sort by</p>
        <select
          value={filters.sort}
          onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
          className="w-full bg-white border-[1.5px] border-ink rounded-md px-3 py-2 text-sm focus:outline-none"
        >
          {sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      <button
        onClick={() => setFilters({ condition: '', maxPrice: 50000, nearby: false, sort: 'recent', radiusKm: 3 })}
        className="w-full text-xs font-medium text-ink-soft hover:text-ink underline underline-offset-2"
      >
        Clear all filters
      </button>
    </div>
  )
}
