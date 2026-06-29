'use client'

import { useEffect, useState } from 'react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import toast from 'react-hot-toast'

interface Slide {
  id?: string
  title: string
  subtitle: string
  badge: string
  cta_text: string
  cta_link: string
  secondary_text?: string | null
  secondary_link?: string | null
  highlight_index: number
  image_url?: string
  accent: string
  is_active: boolean
  sort_order: number
}

export default function HeroSlidesAdmin() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchSlides()
  }, [])

  const fetchSlides = async () => {
    try {
      const res = await fetch('/api/admin/hero-slides', {
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`Failed to load hero slides (${res.status})`)
      }

      const data = await res.json()
      setSlides(data)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load hero slides')
    }
  }

  const handleChange = <K extends keyof Slide>(
    index: number,
    field: K,
    value: Slide[K]
  ) => {
    const updated = [...slides]

    updated[index] = {
      ...updated[index],
      [field]: value,
    }

    setSlides(updated)
  }

  const handleAdd = () => {
    setSlides([
      ...slides,
      {
        id: crypto.randomUUID(), // ✅ ADD THIS
        title: '',
        subtitle: '',
        badge: '',
        cta_text: '',
        cta_link: '',
        secondary_text: '',
        secondary_link: '',
        highlight_index: 0,
        image_url: '',
        accent: 'text-purple-600',
        is_active: true,
        sort_order: slides.length + 1,
      },
    ])
  }

  const handleSave = async () => {
    setLoading(true)

    try {
      const res = await fetch('/api/admin/hero-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slides),
      })

      if (!res.ok) throw new Error()

      toast.success('Slides saved!')
      fetchSlides()
    } catch {
      toast.error('Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (file: File, index: number) => {
    const formData = new FormData()

    // ✅ IMPORTANT: match API → "files"
    formData.append('files', file)

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()

    if (!res.ok) {
      toast.error(data.error || 'Upload failed')
      return
    }

    // ✅ your API returns array
    const uploadedUrl = data.urls?.[0]

    handleChange(index, 'image_url', uploadedUrl)

    toast.success('Image uploaded!')
  }

  const handleRemove = (index: number) => {
    if (!confirm('Are you sure you want to remove this slide?')) return

    const updated = slides.filter((_, i) => i !== index)

    setSlides(updated.map((s, i) => ({
      ...s,
      sort_order: i + 1,
    })))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Hero Banner Manager</h1>

      <button
        onClick={handleAdd}
        className="mb-6 px-4 py-2 bg-black text-white rounded"
      >
        + Add Slide
      </button>

      <div className="space-y-6">
        {slides.map((slide, i) => (
          <div key={i} className="border p-4 rounded-xl space-y-3 bg-white">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Slide {i + 1}</h2>

              <button
                onClick={() => handleRemove(i)}
                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                Remove
              </button>
            </div>

            <input placeholder="Title"
              value={slide.title}
              onChange={(e) => handleChange(i, 'title', e.target.value)}
              className="input hero-slide-input w-33"
            />

            <input placeholder="Subtitle"
              value={slide.subtitle}
              onChange={(e) => handleChange(i, 'subtitle', e.target.value)}
              className="input hero-slide-input w-33"
            />

            <input placeholder="Badge"
              value={slide.badge}
              onChange={(e) => handleChange(i, 'badge', e.target.value)}
              className="input hero-slide-input w-33"
            />

            <div className="grid grid-cols-2 gap-3">
              <input placeholder="CTA Text"
                value={slide.cta_text}
                onChange={(e) => handleChange(i, 'cta_text', e.target.value)}
                className="input hero-slide-input"
              />

              <input placeholder="CTA Link"
                value={slide.cta_link}
                onChange={(e) => handleChange(i, 'cta_link', e.target.value)}
                className="input hero-slide-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Secondary Text"
                value={slide.secondary_text || ''}
                onChange={(e) => handleChange(i, 'secondary_text', e.target.value)}
                className="input hero-slide-input"
              />

              <input placeholder="Secondary Link"
                value={slide.secondary_link || ''}
                onChange={(e) => handleChange(i, 'secondary_link', e.target.value)}
                className="input hero-slide-input"
              />
            </div>

            <div>
              <span>Highlight Index (Title(0)/Subtitle(1)/Badge(2)): </span>
              <input
                type="number"
                placeholder="Highlight index"
                value={slide.highlight_index}
                onChange={(e) => handleChange(i, 'highlight_index', Number(e.target.value))}
                className="input"
              />
            </div>

            {/* Image Upload */}
            <div>
              <span>Select Image: </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file, i)
                }}
              />
              {slide.image_url && (
                <div className="relative h-32 mt-2 rounded overflow-hidden">
                  <OptimizedImage
                    src={slide.image_url}
                    alt={slide.title || 'Slide preview'}
                    fill
                    variant="categoryFeatured"
                    className="object-cover"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-4 items-center">
              <label>
                Active:
                <input
                  type="checkbox"
                  checked={slide.is_active}
                  onChange={(e) => handleChange(i, 'is_active', e.target.checked)}
                />
              </label>

              <input
                type="number"
                value={slide.sort_order}
                onChange={(e) => handleChange(i, 'sort_order', Number(e.target.value))}
                className="input w-24"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="mt-6 px-6 py-3 bg-purple-600 text-white rounded"
      >
        {loading ? 'Saving...' : 'Save All'}
      </button>
    </div>
  )
}