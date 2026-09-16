import { useRef, useState } from 'react'
import { ImagePlus, X, UploadCloud } from 'lucide-react'

export default function ImageUploader({ images, setImages }) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)

  const addFiles = (files) => {
    const arr = Array.from(files).slice(0, 6 - images.length)
    arr.forEach((file) => {
      if (!file.type.startsWith('image/')) return
      if (file.size > 1.5 * 1024 * 1024) return
      const reader = new FileReader()
      reader.onload = () => {
        setImages((imgs) => {
          if (imgs.length >= 6) return imgs
          return [...imgs, { id: crypto.randomUUID(), url: String(reader.result) }]
        })
      }
      reader.readAsDataURL(file)
    })
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
        <UploadCloud size={28} className="mx-auto mb-2 text-ink-soft" />
        <p className="text-sm font-medium">Drag & drop product images here</p>
        <p className="text-xs text-ink-soft mt-1">or click to upload photos (JPEG/PNG, up to 1.5 MB each)</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mt-3">
          {images.map((img, i) => (
            <div key={img.id} className="relative w-16 h-16 rounded-sm overflow-hidden border-[1.5px] border-ink" style={{ transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 3}deg)` }}>
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => setImages((imgs) => imgs.filter((x) => x.id !== img.id))}
                className="absolute top-0 right-0 bg-ink text-paper rounded-bl-sm p-0.5"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {images.length < 6 && (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-16 h-16 rounded-sm border-2 border-dashed border-ink/30 flex items-center justify-center text-ink-soft hover:border-ink/60"
            >
              <ImagePlus size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
