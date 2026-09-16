import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, ArrowLeft, PartyPopper } from 'lucide-react'
import ImageUploader from '../components/ImageUploader'
import CategoryDropdown from '../components/CategoryDropdown'
import PriceInsight from '../components/PriceInsight'
import WashiTape from '../components/WashiTape'
import { categories } from '../data/mockData'
import { api } from '../api'
import { campusFairPrice, rupee, sanitizePredictedPrice } from '../utils/fairPrice'

const conditions = ['New', 'Like New', 'Good', 'Fair']

const fieldClass = (bad) =>
  `w-full bg-white border-[1.5px] rounded-md px-3.5 py-2.5 text-sm ${
    bad ? 'border-coral-ink' : 'border-ink'
  }`

export default function SellLend({ onPublish }) {
  const [step, setStep] = useState('form')
  const [images, setImages] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [condition, setCondition] = useState('')
  const [brand, setBrand] = useState('')
  const [ageMonths, setAgeMonths] = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [listingType, setListingType] = useState('sell')
  const [price, setPrice] = useState('')
  const [lendUnit, setLendUnit] = useState('day')
  const [dueDays, setDueDays] = useState('7')
  const [shareLocation, setShareLocation] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState([])
  const [insight, setInsight] = useState(null)
  const [insightErr, setInsightErr] = useState('')
  const [priceTouched, setPriceTouched] = useState(false)
  const formTopRef = useRef(null)

  const catObj = categories.find((c) => c.id === category)
  const estimatePayload = {
    category,
    title,
    brand,
    originalPrice: Number(originalPrice),
    ageMonths: Number(ageMonths || 0),
    condition,
    listingType: listingType === 'lend' ? 'lend' : 'sale',
    lendUnit,
  }
  const localEstimate = campusFairPrice(estimatePayload)
  const suggested = Number(insight?.recommendedPrice) > 0
    ? Number(insight.recommendedPrice)
    : Number(localEstimate.recommendedPrice) || 0
  const askingPrice = Number(price) > 0 ? Number(price) : suggested

  const goPreview = () => {
    const gaps = []
    if (!String(title).trim()) gaps.push('title')
    if (!category) gaps.push('category')
    if (!condition) gaps.push('condition')
    if (!(Number(originalPrice) > 0)) gaps.push('original price')
    if (listingType === 'lend' && !(Number(dueDays) > 0)) gaps.push('loan days')
    if (!(askingPrice > 0)) gaps.push('asking price')
    if (gaps.length) {
      setMissing(gaps)
      setError(`Fill ${gaps.join(', ')} to preview.`)
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (!(Number(price) > 0) && suggested > 0) setPrice(String(suggested))
    setMissing([])
    setError('')
    setStep('preview')
  }

  useEffect(() => {
    if (!category || !condition || !(Number(originalPrice) > 0)) {
      setInsight(null)
      setInsightErr('')
      return
    }
    const local = campusFairPrice(estimatePayload)
    setInsight(local)
    setInsightErr('')
    if (!priceTouched && local.recommendedPrice > 0) {
      setPrice(String(local.recommendedPrice))
    }
    const t = setTimeout(() => {
      api.predictPrice({
        category,
        brand,
        title,
        originalPrice: Number(originalPrice),
        ageMonths: Number(ageMonths || 0),
        condition,
        listingType: listingType === 'lend' ? 'lend' : 'sale',
        lendUnit,
      })
        .then((res) => {
          const next = sanitizePredictedPrice(res, local)
          setInsight(next)
          setInsightErr('')
          if (!priceTouched && next.recommendedPrice > 0) {
            setPrice(String(next.recommendedPrice))
          }
        })
        .catch((err) => {
          setInsight(local)
          setInsightErr(local.recommendedPrice > 0 ? '' : (err.message || 'AI price recommendation temporarily unavailable.'))
        })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, brand, title, originalPrice, ageMonths, condition, listingType, lendUnit])

  const handlePublish = async () => {
    const finalPrice = askingPrice
    if (!(finalPrice > 0)) {
      setError('Add an asking price before publishing.')
      return
    }
    setPublishing(true)
    setError('')
    try {
      const created = await api.createListing({
        title,
        category,
        condition,
        brand,
        ageMonths: Number(ageMonths || 0),
        originalPrice: Number(originalPrice),
        askingPrice: finalPrice,
        listingType,
        price: finalPrice,
        lendUnit,
        defaultDueDays: Number(dueDays || 7),
        description,
        images: images.map((img) => img.url).filter(Boolean),
        shareLocation,
      })
      setStep('success')
      onPublish?.(created)
    } catch (err) {
      setError(err.message || 'Could not publish listing')
    } finally {
      setPublishing(false)
    }
  }

  const reset = () => {
    setStep('form'); setImages([]); setTitle(''); setDescription('')
    setCategory(''); setCondition(''); setListingType('sell'); setPrice('')
    setBrand(''); setAgeMonths(''); setOriginalPrice(''); setError(''); setInsight(null)
    setMissing([]); setPriceTouched(false)
  }

  if (step === 'success') {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 rounded-full bg-moss-bg border-[1.5px] border-moss-ink/40 flex items-center justify-center mx-auto mb-5">
          <PartyPopper size={32} className="text-moss-ink" />
        </div>
        <h2 className="font-display font-bold text-xl mb-2">Listing submitted</h2>
        <p className="text-sm text-ink-soft mb-6">Saved to MongoDB. High-risk listings are held for admin review instead of going live automatically.</p>
        <button onClick={reset} className="bg-ink text-paper rounded-full px-5 py-2.5 text-sm font-medium">List another item</button>
      </div>
    )
  }

  if (step === 'preview') {
    const Icon = catObj?.icon
    const shownPrice = askingPrice
    return (
      <div className="max-w-lg mx-auto px-4 md:px-6 py-8">
        <button onClick={() => setStep('form')} className="flex items-center gap-1.5 text-sm text-ink-soft mb-5 hover:text-ink">
          <ArrowLeft size={15} /> Back to edit
        </button>
        <h1 className="font-display font-bold text-2xl mb-2">Preview listing</h1>
        <p className="text-sm text-ink-soft mb-5">This is how buyers will see your item. You can still go back and edit.</p>
        <div className="bg-paper-card border-[1.5px] border-ink rounded-md p-4 relative" style={{ transform: 'rotate(-1deg)' }}>
          <WashiTape color={catObj?.tape || 'sky'} rotate={-6} className="-top-2.5 left-8" width={50} />
          {images[0] ? (
            <img src={images[0].url} alt="" className="w-full h-52 object-cover rounded-[3px] border border-ink/70" />
          ) : (
            <div className="w-full h-52 rounded-[3px] border border-ink/70 bg-white flex items-center justify-center">
              {Icon && <Icon size={44} strokeWidth={1.4} className="text-ink-soft" />}
            </div>
          )}
          {images.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {images.slice(1).map((img) => (
                <img key={img.id} src={img.url} alt="" className="w-14 h-14 object-cover rounded-[3px] border border-ink/50" />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[11px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full border border-ink/30 bg-white">
              {listingType === 'lend' ? `Lend / ${lendUnit}` : 'Sell'}
            </span>
            {catObj && (
              <span className="text-[11px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full border border-ink/30 bg-white">
                {catObj.label}
              </span>
            )}
            {condition && (
              <span className="text-[11px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full border border-ink/30 bg-white">
                {condition}
              </span>
            )}
          </div>
          <h2 className="font-display font-bold text-lg mt-3">{title.trim() || 'Untitled item'}</h2>
          <p className="font-mono text-lg font-semibold text-coral-ink mt-2">
            {listingType === 'lend' ? `${rupee(shownPrice)}/${lendUnit}` : rupee(shownPrice)}
          </p>
          {Number(originalPrice) > 0 && (
            <p className="text-xs text-ink-soft mt-1">Original MRP {rupee(originalPrice)}</p>
          )}
          {(brand || ageMonths) && (
            <p className="text-xs text-ink-soft mt-1">
              {[brand, ageMonths !== '' ? `${ageMonths} months old` : ''].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="text-sm text-ink-soft mt-2 whitespace-pre-wrap">{description.trim() || 'No description added.'}</p>
        </div>
        {error && <p className="text-sm text-coral-ink mt-3">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={() => setStep('form')} className="flex-1 border-[1.5px] border-ink rounded-full py-2.5 text-sm font-medium">Back to edit</button>
          <button onClick={handlePublish} disabled={publishing} className="flex-1 bg-ink text-paper rounded-full py-2.5 text-sm font-medium disabled:opacity-50">
            {publishing ? 'Publishing...' : 'Publish listing'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-8" ref={formTopRef}>
      <h1 className="font-display font-bold text-2xl mb-1">List an item</h1>
      <p className="text-sm text-ink-soft mb-6">Price estimate uses original price, condition and age. You can still type your own asking price.</p>

      <div className="space-y-6">
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-2 block">Upload product photos</label>
          <ImageUploader images={images} setImages={setImages} />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Product title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Engineering Mathematics Textbook" className={fieldClass(missing.includes('title'))} />
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Category</label>
            <CategoryDropdown value={category} onChange={setCategory} placeholder="Select category" allowAll={false} />
            {missing.includes('category') && <p className="text-[11px] text-coral-ink mt-1">Required</p>}
          </div>
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Condition</label>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={fieldClass(missing.includes('condition'))}>
              <option value="">Select</option>
              {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Brand</label>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Age (months)</label>
            <input type="number" min="0" value={ageMonths} onChange={(e) => setAgeMonths(e.target.value)} className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm font-mono" />
          </div>
        </div>
        <div>
          <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-2 block">Listing type</label>
          <div className="inline-flex bg-white border-[1.5px] border-ink rounded-full p-1 w-full">
            {['sell', 'lend'].map((t) => (
              <button type="button" key={t} onClick={() => { setListingType(t); setPriceTouched(false) }} className={`flex-1 py-1.5 rounded-full text-sm font-medium capitalize ${listingType === t ? 'bg-ink text-paper' : 'text-ink-soft'}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Original price (₹)</label>
            <input type="number" min="1" placeholder="e.g. 899" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} className={`${fieldClass(missing.includes('original price'))} font-mono`} />
            <p className="text-[11px] text-ink-soft mt-1">What you paid / MRP, not the rent. Example: calculator ₹899, textbook ₹499.</p>
            {insight?.usedTypicalMrp ? (
              <p className="text-[11px] text-coral-ink mt-1">₹{originalPrice || 0} is too low for MRP, so the estimate uses a typical campus price for this item.</p>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Your asking price (₹)</label>
            <input
              type="number"
              min="1"
              value={price}
              onChange={(e) => { setPriceTouched(true); setPrice(e.target.value) }}
              className={`${fieldClass(missing.includes('asking price'))} font-mono`}
            />
            {suggested > 0 ? (
              <p className="text-[11px] text-ink-soft mt-1">Suggested {rupee(suggested)} — you can type a different asking price.</p>
            ) : null}
          </div>
        </div>
        {listingType === 'lend' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Per</label>
              <select value={lendUnit} onChange={(e) => { setLendUnit(e.target.value); setPriceTouched(false) }} className="w-full bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2.5 text-sm">
                <option value="day">day</option>
                <option value="week">week</option>
                <option value="semester">semester</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-wide text-ink-soft mb-1.5 block">Default loan days</label>
              <input type="number" min="1" value={dueDays} onChange={(e) => setDueDays(e.target.value)} className={`${fieldClass(missing.includes('loan days'))} font-mono`} />
            </div>
          </div>
        )}

        {(insight?.recommendedPrice > 0 || insightErr) && (
          <PriceInsight
            unavailable={Boolean(insightErr) && !(insight?.recommendedPrice > 0)}
            fairMin={insight?.minFairPrice || 0}
            fairMax={insight?.maxFairPrice || 0}
            recommendedPrice={insight?.recommendedPrice}
            price={askingPrice}
            confidence={insight?.confidence}
            explanation={insight?.explanation}
            usedTypicalMrp={insight?.usedTypicalMrp}
          />
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} />
          Include this listing in nearby discovery (only if you enabled location in Profile)
        </label>

        <div className="flex items-center gap-2 text-xs text-moss-ink bg-moss-bg border border-moss-ink/30 rounded-md px-3 py-2.5">
          <ShieldCheck size={15} />
          Fraud screening runs on publish. A low price alone is not treated as fraud.
        </div>

        {error && <p className="text-sm text-coral-ink">{error}</p>}

        <button type="button" onClick={goPreview} className="w-full bg-ink text-paper rounded-full py-3 text-sm font-medium">
          Preview listing
        </button>
      </div>
    </div>
  )
}
