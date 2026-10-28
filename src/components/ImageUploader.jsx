import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X, UploadCloud, Loader2, Cloud, HardDrive } from 'lucide-react'
import { api } from '../api'
import { thumb } from '../utils/geo'

const MAX_MB = 5
const MAX_EDGE = 1600

/** Shrink big phone photos in the browser before upload (faster on campus Wi-Fi, cheaper in the cloud). */
async function shrink(file) {
  if (file.type === 'image/gif' || file.size < 600 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/**
 * Photos are uploaded to the server (-> Cloudinary) as soon as they are chosen.
 * `images` is a list of { id, url } returned by the API; the listing only stores those URLs.
 */
export default function ImageUploader({ images, setImages }) {
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    api.getUploadStatus().then(setStatus).catch(() => {})
  }, [])

  const addFiles = async (fileList) => {
    setError('')
    const room = 6 - images.length
    const picked = Array.from(fileList).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room))
    if (!picked.length) return setError(room <= 0 ? 'You can add up to 6 photos' : 'Choose image files (JPEG, PNG, WebP)')
    const tooBig = picked.find((f) => f.size > 25 * 1024 * 1024)
    if (tooBig) return setError(`${tooBig.name} is too large`)
    setBusy((n) => n + picked.length)
    try {
      const files = await Promise.all(picked.map(shrink))
      const oversize = files.find((f) => f.size > MAX_MB * 1024 * 1024)
      if (oversize) throw new Error(`${oversize.name} is over ${MAX_MB} MB even after resizing`)
      const res = await api.uploadImages(files)
      setImages((imgs) => [...imgs, ...res.images.map((i) => ({ id: i.id, url: i.url }))].slice(0, 6))
      if (res.errors?.length) setError(res.errors.map((e) => `${e.name}: ${e.error}`).join(' · '))
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setBusy((n) => n - picked.length)
    }
  }

  const remove = async (img) => {
    setImages((imgs) => imgs.filter((x) => x.id !== img.id))
    api.deleteUpload(img.id).catch(() => {}) // frees the cloud copy; orphans are also auto-cleaned after 24h
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
          dragActive ? 'border-tape-coral bg-coral-bg' : 'border-ink/30 bg-white hover:border-ink/60'
        }`}
      >
        {busy > 0 ? <Loader2 size={28} className="mx-auto mb-2 text-ink-soft animate-spin" /> : <UploadCloud size={28} className="mx-auto mb-2 text-ink-soft" />}
        <p className="text-sm font-medium">{busy > 0 ? 'Uploading…' : 'Drag & drop product images here'}</p>
        <p className="text-xs text-ink-soft mt-1">or click to choose photos (JPEG/PNG/WebP, up to 6)</p>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      </div>

      {status && (
        <p className={`text-[11px] mt-2 flex items-center gap-1.5 ${status.durable ? 'text-moss-ink' : 'text-yellow-ink'}`}>
          {status.durable ? <Cloud size={12} /> : <HardDrive size={12} />}
          {status.durable ? 'Photos are stored in the cloud.' : 'Cloud storage not configured — photos are saved on the server disk (dev mode).'}
        </p>
      )}
      {error && <p className="text-xs text-coral-ink mt-2">{error}</p>}

      {(images.length > 0 || busy > 0) && (
        <div className="flex flex-wrap gap-2.5 mt-3">
          {images.map((img, i) => (
            <div key={img.id} className="relative w-16 h-16 rounded-sm overflow-hidden border-[1.5px] border-ink" style={{ transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 3}deg)` }}>
              <img src={thumb(img.url, 160)} alt="" className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-ink/80 text-paper text-[9px] text-center">cover</span>}
              <button type="button" onClick={() => remove(img)} className="absolute top-0 right-0 bg-ink text-paper rounded-bl-sm p-0.5" aria-label="Remove photo">
                <X size={11} />
              </button>
            </div>
          ))}
          {Array.from({ length: busy }).map((_, i) => (
            <div key={`busy-${i}`} className="w-16 h-16 rounded-sm border-2 border-dashed border-ink/30 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-ink-soft" />
            </div>
          ))}
          {images.length + busy < 6 && (
            <button type="button" onClick={() => inputRef.current?.click()} className="w-16 h-16 rounded-sm border-2 border-dashed border-ink/30 flex items-center justify-center text-ink-soft hover:border-ink/60">
              <ImagePlus size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
