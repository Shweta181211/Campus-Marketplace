import ProductCard from './ProductCard'
import { PackageSearch } from 'lucide-react'

export default function ProductGrid({ items, favorites, onToggleFavorite, onOpen }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <PackageSearch size={40} className="text-ink-soft mb-3" />
        <p className="font-display font-semibold text-base">Nothing here yet</p>
        <p className="text-sm text-ink-soft mt-1">Try a different search or clear a filter.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
      {items.map((item, i) => (
        <ProductCard
          key={item.id}
          item={item}
          index={i}
          favorited={favorites.includes(item.id)}
          onToggleFavorite={onToggleFavorite}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}
