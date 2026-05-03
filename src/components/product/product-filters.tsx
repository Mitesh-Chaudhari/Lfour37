'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useState, useEffect } from 'react'
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterOption {
  id: string
  name: string
  slug: string
}

interface ProductFiltersPanelProps {
  categories: FilterOption[]
  sizes: string[]
  colors: string[]
  searchParams: Record<string, string | string[] | undefined>
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-gray-200 py-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-sm font-semibold text-gray-900 mb-2"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

export function ProductFiltersPanel({ categories, sizes, colors, searchParams }: ProductFiltersPanelProps) {
  const router = useRouter()
  const pathname = usePathname()

  // 🔥 RANGE LIMITS (you can make dynamic later)
  const MIN = 0
  const MAX = 3000

  const [minPrice, setMinPrice] = useState(Number(searchParams.minPrice) || MIN)
  const [maxPrice, setMaxPrice] = useState(Number(searchParams.maxPrice) || MAX)

  // 🔥 debounce update
  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilter('minPrice', String(minPrice))
      updateFilter('maxPrice', String(maxPrice))
    }, 400)

    return () => clearTimeout(timer)
  }, [minPrice, maxPrice])

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams()

      Object.entries(searchParams).forEach(([k, v]) => {
        if (k === key || k === 'page') return
        if (Array.isArray(v)) v.forEach((item) => params.append(k, item))
        else if (v) params.set(k, v)
      })

      if (value) params.set(key, value)

      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, pathname, router]
  )

  const toggleArrayFilter = useCallback(
    (key: string, value: string) => {
      const current = searchParams[key]
      const currentArray = Array.isArray(current) ? current : current ? [current] : []
      const params = new URLSearchParams()

      Object.entries(searchParams).forEach(([k, v]) => {
        if (k === key || k === 'page') return
        if (Array.isArray(v)) v.forEach((item) => params.append(k, item))
        else if (v) params.set(k, v)
      })

      if (currentArray.includes(value)) {
        currentArray.filter((v) => v !== value).forEach((v) => params.append(key, v))
      } else {
        [...currentArray, value].forEach((v) => params.append(key, v))
      }

      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, pathname, router]
  )

  const clearAllFilters = () => router.push(pathname)

  const hasFilters = Object.keys(searchParams).some((k) => k !== 'page' && searchParams[k])

  const selectedSizes = typeof searchParams.sizes === 'string' ? [searchParams.sizes] : searchParams.sizes || []
  const selectedColors = typeof searchParams.colors === 'string' ? [searchParams.colors] : searchParams.colors || []

  function renderCategories(cats: any[], level = 0) {
    return cats.map((cat) => (
      <div key={cat.id} style={{ paddingLeft: level * 12 }}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="category"
            checked={searchParams.category === cat.slug}
            onChange={() => updateFilter('category', cat.slug)}
            className="accent-primary-600"
          />
          <span className="text-sm text-gray-700">
            {level > 0} {cat.name}
          </span>
        </label>

        {cat.children?.length > 0 && renderCategories(cat.children, level + 1)}
      </div>
    ))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-gray-600" />
          <span className="font-semibold text-gray-900">Filters</span>
        </div>
        {hasFilters && (
          <button onClick={clearAllFilters} className="text-xs text-purple-600 hover:underline flex items-center gap-1">
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      {/* Category */}
      <FilterSection title="Category">
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="category"
              checked={!searchParams.category}
              onChange={() => updateFilter('category', null)}
              className="accent-primary-600"
            />
            <span className="text-sm text-gray-700">All Categories</span>
          </label>
          {/* {categories.map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="category"
                checked={searchParams.category === cat.slug}
                onChange={() => updateFilter('category', cat.slug)}
                className="accent-primary-600"
              />
              <span className="text-sm text-gray-700">{cat.name}</span>
            </label>
          ))} */}
          {renderCategories(categories)}
        </div>
      </FilterSection>

      <FilterSection title="Price Range">
        <div className="space-y-4">
          {/* Labels */}
          <div className="flex justify-between text-sm font-medium">
            <span>₹{minPrice}</span>
            <span>₹{maxPrice}</span>
          </div>

          {/* Slider */}
          <div className="relative h-2 bg-gray-200 rounded-full">
            <div
              className="absolute h-2 bg-purple-600 rounded-full"
              style={{
                left: `${(minPrice / MAX) * 100}%`,
                right: `${100 - (maxPrice / MAX) * 100}%`,
              }}
            />

            {/* Min */}
            <input
              type="range"
              min={MIN}
              max={MAX}
              value={minPrice}
              onChange={(e) => setMinPrice(Math.min(Number(e.target.value), maxPrice - 50))}
              className="absolute w-full top-0 pointer-events-none appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
            />

            {/* Max */}
            <input
              type="range"
              min={MIN}
              max={MAX}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Math.max(Number(e.target.value), minPrice + 50))}
              className="absolute w-full top-0 pointer-events-none appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
            />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {[
              [99, 499],
              [499, 999],
              [999, 1499],
              [1499, 2499],
            ].map(([min, max]) => (
              <button
                key={`${min}-${max}`}
                onClick={() => {
                  setMinPrice(min)
                  setMaxPrice(max)
                }}
                className="px-2 py-1 text-xs border rounded-full hover:border-purple-400"
              >
                ₹{min} – ₹{max}
              </button>
            ))}
          </div>
        </div>
      </FilterSection>

      {/* Size */}
      <FilterSection title="Size">
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <button
              key={size}
              onClick={() => toggleArrayFilter('sizes', size)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-lg border',
                selectedSizes.includes(size) ? 'bg-purple-600 text-white' : ''
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Color */}
      <FilterSection title="Color">
        <div className="flex flex-wrap gap-2">
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => toggleArrayFilter('colors', color)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-lg border',
                selectedColors.includes(color) ? 'bg-purple-600 text-white' : ''
              )}
            >
              {color}
            </button>
          ))}
        </div>
      </FilterSection>
    </div>
  )
}