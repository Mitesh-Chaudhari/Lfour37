'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useState, useEffect } from 'react'
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react'

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

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-gray-200 py-4">
      <button
        type="button"
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

function toParamList(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

export function ProductFiltersPanel({
  categories,
  sizes,
  colors,
  searchParams,
}: ProductFiltersPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState<string | null>(null)

  const selectedCategories = toParamList(searchParams.category)
  const selectedSizes = toParamList(searchParams.sizes)
  const selectedColors = toParamList(searchParams.colors)

  const MIN = 0
  const MAX = 3000

  const [minPrice, setMinPrice] = useState(Number(searchParams.minPrice) || MIN)
  const [maxPrice, setMaxPrice] = useState(Number(searchParams.maxPrice) || MAX)

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
      const current = toParamList(searchParams[key])
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]

      const params = new URLSearchParams()

      Object.entries(searchParams).forEach(([k, v]) => {
        if (k === key || k === 'page') return
        if (Array.isArray(v)) v.forEach((item) => params.append(k, item))
        else if (v) params.set(k, v)
      })

      next.forEach((item) => params.append(key, item))
      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, pathname, router]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilter('minPrice', String(minPrice))
      updateFilter('maxPrice', String(maxPrice))
    }, 400)

    return () => clearTimeout(timer)
  }, [minPrice, maxPrice])

  const clearAllFilters = () => router.push(pathname)

  const hasFilters = Object.keys(searchParams).some(
    (key) => key !== 'page' && searchParams[key]
  )

  function renderCategories(
    cats: FilterOption[],
    config: {
      idPrefix: string
      selectedSlugs: string[]
      onToggle: (slug: string) => void
    },
    level = 0
  ) {
    return cats.map((cat) => {
      const inputId = `${config.idPrefix}-${cat.id}`
      const checked = config.selectedSlugs.includes(cat.slug)

      return (
        <div key={cat.id} style={{ paddingLeft: level * 12 }}>
          <label
            htmlFor={inputId}
            className="inline-flex items-center gap-2 cursor-pointer py-1"
          >
            <input
              id={inputId}
              type="checkbox"
              checked={checked}
              onChange={() => config.onToggle(cat.slug)}
              className="h-4 w-4 rounded border-gray-300 accent-purple-600 shrink-0"
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

  function renderCheckboxList(
    items: string[],
    selected: string[],
    key: 'sizes' | 'colors',
    idPrefix: string
  ) {
    return (
      <div className="space-y-2 flex flex-wrap justify-between items-center">
        {items.map((item) => {
          const inputId = `${idPrefix}-${item}`
          const checked = selected.includes(item)

          return (
            <label
              key={item}
              htmlFor={inputId}
              className="inline-flex items-center gap-2 cursor-pointer py-1 w-1/2 mb-0"
            >
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                onChange={() => toggleArrayFilter(key, item)}
                className="h-4 w-4 rounded border-gray-300 accent-purple-600 shrink-0"
              />
              <span className="text-sm text-gray-700">{item}</span>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <>
      {/* MOBILE FILTERS */}
      <div className="md:hidden mb-4 relative">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(
            [
              ['category', 'Category'],
              ['price', 'Price'],
              ['size', 'Size'],
              ['color', 'Color'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobileOpen(mobileOpen === id ? null : id)}
              className="whitespace-nowrap px-4 py-2 border rounded-full text-sm"
            >
              {label}
              {id === 'category' && selectedCategories.length > 0
                ? ` (${selectedCategories.length})`
                : null}
              {id === 'size' && selectedSizes.length > 0
                ? ` (${selectedSizes.length})`
                : null}
              {id === 'color' && selectedColors.length > 0
                ? ` (${selectedColors.length})`
                : null}
            </button>
          ))}

          {hasFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="whitespace-nowrap px-4 py-2 border rounded-full text-sm text-red-500"
            >
              Clear
            </button>
          )}
        </div>

        {mobileOpen && (
          <div className="mt-3 border rounded-xl bg-white p-4 shadow-sm absolute left-0 right-0 w-full z-50">
            {mobileOpen === 'category' && (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {renderCategories(categories, {
                  idPrefix: 'mobile-category',
                  selectedSlugs: selectedCategories,
                  onToggle: (slug) => toggleArrayFilter('category', slug),
                })}
              </div>
            )}

            {mobileOpen === 'size' &&
              renderCheckboxList(sizes, selectedSizes, 'sizes', 'mobile-size')}

            {mobileOpen === 'color' &&
              renderCheckboxList(
                colors,
                selectedColors,
                'colors',
                'mobile-color'
              )}

            {mobileOpen === 'price' && (
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span>₹{minPrice}</span>
                  <span>₹{maxPrice}</span>
                </div>

                <input
                  type="range"
                  min={MIN}
                  max={MAX}
                  value={minPrice}
                  onChange={(e) => setMinPrice(Number(e.target.value))}
                  className="w-full"
                />

                <input
                  type="range"
                  min={MIN}
                  max={MAX}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* DESKTOP FILTERS */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-gray-600" />
            <span className="font-semibold text-gray-900">Filters</span>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-purple-600 hover:underline flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        <FilterSection title="Category">
          <div className="space-y-1">
            {renderCategories(categories, {
              idPrefix: 'desktop-category',
              selectedSlugs: selectedCategories,
              onToggle: (slug) => toggleArrayFilter('category', slug),
            })}
          </div>
        </FilterSection>

        <FilterSection title="Price Range">
          <div className="space-y-4">
            <div className="flex justify-between text-sm font-medium">
              <span>₹{minPrice}</span>
              <span>₹{maxPrice}</span>
            </div>

            <div className="relative h-2 bg-gray-200 rounded-full">
              <div
                className="absolute h-2 bg-purple-600 rounded-full"
                style={{
                  left: `${(minPrice / MAX) * 100}%`,
                  right: `${100 - (maxPrice / MAX) * 100}%`,
                }}
              />

              <input
                type="range"
                min={MIN}
                max={MAX}
                value={minPrice}
                onChange={(e) =>
                  setMinPrice(Math.min(Number(e.target.value), maxPrice - 50))
                }
                className="absolute w-full top-0 pointer-events-none appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
              />

              <input
                type="range"
                min={MIN}
                max={MAX}
                value={maxPrice}
                onChange={(e) =>
                  setMaxPrice(Math.max(Number(e.target.value), minPrice + 50))
                }
                className="absolute w-full top-0 pointer-events-none appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                [99, 499],
                [499, 999],
                [999, 1499],
                [1499, 2499],
              ].map(([min, max]) => (
                <button
                  key={`${min}-${max}`}
                  type="button"
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

        <FilterSection title="Size">
          {renderCheckboxList(sizes, selectedSizes, 'sizes', 'desktop-size')}
        </FilterSection>

        <FilterSection title="Color">
          {renderCheckboxList(colors, selectedColors, 'colors', 'desktop-color')}
        </FilterSection>
      </div>
    </>
  )
}
