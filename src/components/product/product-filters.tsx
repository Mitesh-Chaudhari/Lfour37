'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useState, useEffect } from 'react'
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterOption {
  id: string
  name: string
  slug: string
  children?: FilterOption[]
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
  const [mobileOpen, setMobileOpen] =
  useState<string | null>(null)

  const currentCategory =
    typeof searchParams.category === 'string' ? searchParams.category : null

  const [optimisticCategory, setOptimisticCategory] = useState<string | null>(
    currentCategory
  )

  useEffect(() => {
    setOptimisticCategory(currentCategory)
  }, [currentCategory])

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

  const closeMobilePanel = () => setMobileOpen(null)

  const handleMobileCategoryChange = (value: string | null) => {
    setOptimisticCategory(value)
    updateFilter('category', value)
    closeMobilePanel()
  }

  const handleMobileArrayFilter = (key: string, value: string) => {
    toggleArrayFilter(key, value)
    closeMobilePanel()
  }

  const hasFilters = Object.keys(searchParams).some((k) => k !== 'page' && searchParams[k])

  const selectedSizes = typeof searchParams.sizes === 'string' ? [searchParams.sizes] : searchParams.sizes || []
  const selectedColors = typeof searchParams.colors === 'string' ? [searchParams.colors] : searchParams.colors || []

  function renderCategories(
    cats: FilterOption[],
    config: {
      radioName: string
      selectedSlug: string | null
      onCategorySelect: (slug: string) => void
    },
    level = 0
  ) {
    return cats.map((cat) => {
      const inputId = `${config.radioName}-${cat.id}`

      return (
        <div key={cat.id} style={{ paddingLeft: level * 12 }}>
          <label
            htmlFor={inputId}
            className="flex items-center gap-2 cursor-pointer py-1"
          >
            <input
              id={inputId}
              type="radio"
              name={config.radioName}
              checked={config.selectedSlug === cat.slug}
              onChange={() => config.onCategorySelect(cat.slug)}
              className="accent-primary-600 shrink-0"
            />
            <span className="text-sm text-gray-700">{cat.name}</span>
          </label>

          {cat.children?.length
            ? renderCategories(cat.children, config, level + 1)
            : null}
        </div>
      )
    })
  }

  return (
    <>
      {/* MOBILE FILTERS */}

      <div className="md:hidden mb-4 relative">
        <div
          className="
            flex
            gap-2
            overflow-x-auto
            pb-2
            scrollbar-hide
          "
        >
          <button
            onClick={() =>
              setMobileOpen(
                mobileOpen === 'category'
                  ? null
                  : 'category'
              )
            }
            className="
              whitespace-nowrap
              px-4
              py-2
              border
              rounded-full
              text-sm
            "
          >
            Category
          </button>

          <button
            onClick={() =>
              setMobileOpen(
                mobileOpen === 'price'
                  ? null
                  : 'price'
              )
            }
            className="
              whitespace-nowrap
              px-4
              py-2
              border
              rounded-full
              text-sm
            "
          >
            Price
          </button>

          <button
            onClick={() =>
              setMobileOpen(
                mobileOpen === 'size'
                  ? null
                  : 'size'
              )
            }
            className="
              whitespace-nowrap
              px-4
              py-2
              border
              rounded-full
              text-sm
            "
          >
            Size
          </button>

          <button
            onClick={() =>
              setMobileOpen(
                mobileOpen === 'color'
                  ? null
                  : 'color'
              )
            }
            className="
              whitespace-nowrap
              px-4
              py-2
              border
              rounded-full
              text-sm
            "
          >
            Color
          </button>

          {hasFilters && (
            <button
              onClick={clearAllFilters}
              className="
                whitespace-nowrap
                px-4
                py-2
                border
                rounded-full
                text-sm
                text-red-500
              "
            >
              Clear
            </button>
          )}
        </div>

        {mobileOpen && (
          <div
            className="
              mt-3
              border
              rounded-xl
              bg-white
              p-4
              shadow-sm
              absolute left-0 right-0 w-full z-50
            "
          >
            {mobileOpen ===
              'category' && (
              <div className="space-y-2">
                <label
                  htmlFor="mobile-category-all"
                  className="flex items-center gap-2 cursor-pointer py-1"
                >
                  <input
                    id="mobile-category-all"
                    type="radio"
                    name="mobile-category-filter"
                    checked={optimisticCategory === null}
                    onChange={() => handleMobileCategoryChange(null)}
                    className="accent-primary-600 shrink-0"
                  />
                  <span className="text-sm text-gray-700">All Categories</span>
                </label>

                {renderCategories(categories, {
                  radioName: 'mobile-category-filter',
                  selectedSlug: optimisticCategory,
                  onCategorySelect: (slug) => handleMobileCategoryChange(slug),
                })}
              </div>
            )}

            {mobileOpen ===
              'size' && (
              <div className="flex flex-wrap gap-2">
                {sizes.map(
                  (size) => (
                    <button
                      key={size}
                      onClick={() =>
                        handleMobileArrayFilter(
                          'sizes',
                          size
                        )
                      }
                      className={cn(
                        'px-3 py-1 rounded border text-xs',
                        selectedSizes.includes(
                          size
                        ) &&
                          'bg-purple-600 text-white'
                      )}
                    >
                      {size}
                    </button>
                  )
                )}
              </div>
            )}

            {mobileOpen ===
              'color' && (
              <div className="flex flex-wrap gap-2">
                {colors.map(
                  (color) => (
                    <button
                      key={color}
                      onClick={() =>
                        handleMobileArrayFilter(
                          'colors',
                          color
                        )
                      }
                      className={cn(
                        'px-3 py-1 rounded border text-xs',
                        selectedColors.includes(
                          color
                        ) &&
                          'bg-purple-600 text-white'
                      )}
                    >
                      {color}
                    </button>
                  )
                )}
              </div>
            )}

            {mobileOpen ===
              'price' && (
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span>
                    ₹{minPrice}
                  </span>
                  <span>
                    ₹{maxPrice}
                  </span>
                </div>

                <input
                  type="range"
                  min={MIN}
                  max={MAX}
                  value={minPrice}
                  onChange={(e) =>
                    setMinPrice(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className="w-full"
                // className="w-full pointer-events-none appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
                />

                <input
                  type="range"
                  min={MIN}
                  max={MAX}
                  value={maxPrice}
                  onChange={(e) =>
                    setMaxPrice(
                      Number(
                        e.target.value
                      )
                    )
                  }
                  className="w-full"
                // className="w-full pointer-events-none appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
                />
              </div>
            )}
          </div>
        )}
      </div>
      <div
          className="
            hidden
            md:block
            bg-white
            rounded-xl
            border
            border-gray-200
            p-4
          "
        >
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
            <label
              htmlFor="desktop-category-all"
              className="flex items-center gap-2 cursor-pointer py-1"
            >
              <input
                id="desktop-category-all"
                type="radio"
                name="desktop-category-filter"
                checked={!currentCategory}
                onChange={() => updateFilter('category', null)}
                className="accent-primary-600 shrink-0"
              />
              <span className="text-sm text-gray-700">All Categories</span>
            </label>
            {renderCategories(categories, {
              radioName: 'desktop-category-filter',
              selectedSlug: currentCategory,
              onCategorySelect: (slug) => updateFilter('category', slug),
            })}
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
    </>
  )
}