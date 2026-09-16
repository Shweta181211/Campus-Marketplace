import {
  BookOpen, Bike, Cpu, Sofa, FlaskConical, Home, StickyNote, Package,
  Shirt, Coffee, Backpack, Lamp,
} from 'lucide-react'

export const categories = [
  { id: 'books', label: 'Books', icon: BookOpen, tape: 'yellow' },
  { id: 'cycles', label: 'Cycles', icon: Bike, tape: 'sky' },
  { id: 'electronics', label: 'Electronics', icon: Cpu, tape: 'coral' },
  { id: 'lab', label: 'Lab equipment', icon: FlaskConical, tape: 'moss' },
  { id: 'furniture', label: 'Furniture', icon: Sofa, tape: 'yellow' },
  { id: 'hostel', label: 'Hostel essentials', icon: Home, tape: 'sky' },
  { id: 'notes', label: 'Notes', icon: StickyNote, tape: 'coral' },
  { id: 'other', label: 'Other', icon: Package, tape: 'moss' },
]

export const avatars = ['🐨', '🦊', '🐢', '🦉', '🐝', '🐙', '🦩', '🐿️']

const iconMap = {
  books: BookOpen,
  cycles: Bike,
  electronics: Cpu,
  lab: FlaskConical,
  furniture: Sofa,
  hostel: Home,
  notes: StickyNote,
  other: Package,
  backpack: Backpack,
  lamp: Lamp,
  shirt: Shirt,
  coffee: Coffee,
}

/** Attach Lucide icon component so cards/details can render like before */
export function hydrateListing(listing) {
  if (!listing) return listing
  const iconKey = listing.iconKey || listing.category || 'other'
  return {
    ...listing,
    id: listing.id || listing._id,
    icon: iconMap[iconKey] || Package,
  }
}

export function hydrateListings(list) {
  return (list || []).map(hydrateListing)
}
