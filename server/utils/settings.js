import Settings from '../models/Settings.js'

export const DEFAULT_CATEGORIES = [
  { id: 'books', label: 'Books', tape: 'yellow', enabled: true },
  { id: 'cycles', label: 'Cycles', tape: 'sky', enabled: true },
  { id: 'electronics', label: 'Electronics', tape: 'coral', enabled: true },
  { id: 'lab', label: 'Lab equipment', tape: 'moss', enabled: true },
  { id: 'furniture', label: 'Furniture', tape: 'yellow', enabled: true },
  { id: 'hostel', label: 'Hostel essentials', tape: 'sky', enabled: true },
  { id: 'notes', label: 'Notes', tape: 'coral', enabled: true },
  { id: 'other', label: 'Other', tape: 'moss', enabled: true },
]

// Items students may not trade on campus + common scam phrases. Admins edit this list in the admin console.
export const DEFAULT_BANNED_WORDS = [
  'alcohol',
  'cigarette',
  'vape',
  'weed',
  'drugs',
  'weapon',
  'fake id',
  'exam paper leak',
  'assignment for money',
  'crypto investment',
  'double your money',
]

let cache = null
let cacheAt = 0

export async function getSettings() {
  if (cache && Date.now() - cacheAt < 15000) return cache
  let doc = await Settings.findOne({ key: 'marketplace' }).lean()
  if (!doc) {
    try {
      doc = (await Settings.create({ key: 'marketplace', bannedWords: DEFAULT_BANNED_WORDS, categories: DEFAULT_CATEGORIES })).toObject()
    } catch {
      doc = await Settings.findOne({ key: 'marketplace' }).lean() // created concurrently
    }
  }
  cache = doc
  cacheAt = Date.now()
  return doc
}

export function clearSettingsCache() {
  cache = null
}

export async function enabledCategories() {
  const s = await getSettings()
  return (s?.categories?.length ? s.categories : DEFAULT_CATEGORIES).filter((c) => c.enabled !== false)
}

export async function isCategoryAllowed(id) {
  return (await enabledCategories()).some((c) => c.id === id)
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Returns the first banned word/phrase found in any of the texts (whole-word, case-insensitive), or null. */
export async function findBannedWord(...texts) {
  const s = await getSettings()
  const words = s?.bannedWords || []
  const hay = texts.filter(Boolean).join(' \n ')
  if (!hay) return null
  for (const w of words) {
    if (!w) continue
    const rx = new RegExp(`(^|[^a-z0-9])${escapeRegex(w.toLowerCase())}($|[^a-z0-9])`, 'i')
    if (rx.test(hay)) return w
  }
  return null
}
