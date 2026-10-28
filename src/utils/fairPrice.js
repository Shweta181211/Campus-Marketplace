export const CONDITION_FACTOR = { New: 0.92, 'Like New': 0.78, Good: 0.62, Fair: 0.45 }

export const CATEGORY_FACTOR = {
  books: 0.95,
  notes: 0.7,
  electronics: 1,
  cycles: 1.02,
  lab: 0.98,
  furniture: 1,
  hostel: 0.97,
  other: 1,
}

export const CATEGORY_TYPICAL_MRP = {
  books: 499,
  notes: 149,
  electronics: 1999,
  cycles: 6500,
  lab: 799,
  furniture: 1499,
  hostel: 799,
  other: 699,
}

const TITLE_HINTS = [
  [/casio|fx-?991|scientific|calculat/i, 899],
  [/iphone|pixel|oneplus|samsung galaxy/i, 22000],
  [/macbook|laptop|thinkpad/i, 38000],
  [/ipad|tablet/i, 18000],
  [/headphone|earbud|boat|airpods|neckband/i, 1299],
  [/cycle|bicycle|hero|firefox|giant|bsa/i, 6500],
  [/textbook|mathematics|physics|chemistry|engineering|cengage|pearson|wiley/i, 550],
  [/notes|handwritten|photocopy/i, 120],
  [/kettle|iron|induction|mixer/i, 899],
  [/mattress|bed/i, 2500],
  [/chair|table|almirah/i, 1200],
  [/drafter|lab coat|apron|multimeter/i, 499],
]

const LEND_RATES = { day: 0.02, week: 0.07, semester: 0.25 }

export function typicalMrp({ category, title, brand } = {}) {
  const text = `${title || ''} ${brand || ''}`
  for (const [re, price] of TITLE_HINTS) {
    if (re.test(text)) return price
  }
  return CATEGORY_TYPICAL_MRP[category] || 799
}

export function resolveOriginalPrice(payload = {}) {
  const typed = Math.max(0, Number(payload.originalPrice || payload.price || 0))
  const typical = typicalMrp(payload)
  if (typed >= 80) return { original: typed, assumed: false, typed, typical }
  return { original: typical, assumed: true, typed, typical }
}

export function campusFairPrice(payload = {}) {
  const listingType = payload.listingType === 'lend' ? 'lend' : 'sale'
  const lendUnit = payload.lendUnit || 'day'
  const condition = payload.condition || ''
  const age = Math.max(0, Number(payload.ageMonths || 0))
  const { original, assumed, typed } = resolveOriginalPrice(payload)

  if (!(original > 0) || !condition) {
    return {
      recommendedPrice: 0,
      minFairPrice: 0,
      maxFairPrice: 0,
      confidence: 0,
      explanation: 'Enter category, condition and a realistic original/MRP price to estimate.',
      source: 'heuristic',
      usedTypicalMrp: false,
    }
  }

  const factor = CONDITION_FACTOR[condition] || 0.6
  const decay = Math.max(0.22, 1 - age * 0.012)
  const cat = CATEGORY_FACTOR[payload.category] || 1
  let rec = original * factor * decay * cat
  if (listingType === 'lend') {
    rec *= LEND_RATES[lendUnit] || LEND_RATES.day
    const minRent = lendUnit === 'day' ? 10 : lendUnit === 'week' ? 40 : 100
    rec = Math.max(minRent, Math.min(original * 0.25, rec))
  } else {
    rec = Math.max(40, Math.min(original * 0.97, rec))
  }
  rec = Math.max(1, Math.round(rec))
  const basis = assumed
    ? `typical campus MRP ₹${original} (₹${typed || 0} is too low to be original price)`
    : `original MRP ₹${original}`
  return {
    recommendedPrice: rec,
    minFairPrice: Math.max(1, Math.round(rec * 0.88)),
    maxFairPrice: Math.round(rec * 1.12),
    confidence: assumed ? 58 : 74,
    explanation:
      `Calculated from ${basis}, ${condition}, ${age} months old` +
      `${listingType === 'lend' ? ` per ${lendUnit}` : ''}. Not guaranteed market value.`,
    source: 'heuristic',
    usedTypicalMrp: assumed,
  }
}

/**
 * Trust the trained model; only fall back to the formula when its answer is unusable.
 * (The previous version blended 65% formula + 35% model, which hid the model entirely.)
 */
export function sanitizePredictedPrice(ml, heuristic) {
  const base = Number(heuristic?.recommendedPrice) || 0
  const rec = Number(ml?.recommendedPrice)
  const unusable = !Number.isFinite(rec) || rec <= 0 || (base > 0 && (rec > base * 4 || rec < base / 4))
  if (unusable) return heuristic
  const min = Number(ml.minFairPrice)
  const max = Number(ml.maxFairPrice)
  return {
    recommendedPrice: Math.round(rec),
    minFairPrice: Number.isFinite(min) && min > 0 ? Math.round(Math.min(min, rec)) : Math.max(1, Math.round(rec * 0.88)),
    maxFairPrice: Number.isFinite(max) && max > 0 ? Math.round(Math.max(max, rec)) : Math.round(rec * 1.12),
    confidence: Math.min(95, Math.max(30, Number(ml.confidence) || 60)),
    explanation: ml.explanation || heuristic?.explanation || '',
    source: ml.source || 'ml',
    metrics: ml.metrics,
    usedTypicalMrp: Boolean(ml.usedTypicalMrp ?? heuristic?.usedTypicalMrp),
  }
}

export function rupee(n) {
  const v = Math.round(Number(n) || 0)
  return `₹${Math.max(0, v)}`
}
