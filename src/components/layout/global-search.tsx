'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Clock,
  Loader2,
  Search,
  TrendingUp,
  X,
} from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import {
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
  saveRecentSearch,
  type SearchCategoryResult,
  type SearchProductResult,
} from '@/lib/search'

interface SearchResponse {
  products: SearchProductResult[]
  categories: SearchCategoryResult[]
  trending?: string[]
  query?: string
}

interface GlobalSearchProps {
  onClose: () => void
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function GlobalSearch({ onClose }: GlobalSearchProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [results, setResults] = useState<SearchResponse>({
    products: [],
    categories: [],
    trending: [],
  })

  const debouncedQuery = useDebounce(query.trim(), 300)

  const loadRecentSearches = useCallback(() => {
    setRecentSearches(getRecentSearches())
  }, [])

  const fetchSuggestions = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const url = term
        ? `/api/search?q=${encodeURIComponent(term)}`
        : '/api/search'
      const res = await fetch(url)
      if (!res.ok) return
      const data = (await res.json()) as SearchResponse
      setResults(data)
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRecentSearches()
    fetchSuggestions(debouncedQuery)
  }, [debouncedQuery, fetchSuggestions, loadRecentSearches])

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const navigateToSearch = (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    saveRecentSearch(trimmed)
    setQuery('')
    setShowSuggestions(false)
    onClose()
    router.push(`/products?search=${encodeURIComponent(trimmed)}`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigateToSearch(query)
  }

  const handleSelect = (term: string) => {
    navigateToSearch(term)
  }

  const handleClearRecent = () => {
    clearRecentSearches()
    loadRecentSearches()
  }

  const hasQuery = debouncedQuery.length > 0
  const hasResults =
    results.products.length > 0 || results.categories.length > 0
  const showTrending =
    !hasQuery && (results.trending?.length || recentSearches.length > 0)

  return (
    <div className="border-t border-gray-100 bg-white px-4 py-3">
      <form
        ref={containerRef}
        onSubmit={handleSubmit}
        className="max-w-2xl mx-auto flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none z-10" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search for clothing, brands..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoComplete="off"
            aria-label="Search products"
            aria-expanded={showSuggestions}
            aria-haspopup="listbox"
          />

          {showSuggestions && (
            <div
              className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-xl"
              role="listbox"
            >
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                </div>
              )}

              {!loading && (
                <div className="p-2">
                  {!hasQuery && recentSearches.length > 0 && (
                    <section className="mb-2">
                      <div className="flex items-center justify-between px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Recent Searches
                        </p>
                        <button
                          type="button"
                          onClick={handleClearRecent}
                          className="text-xs text-purple-600 hover:text-purple-700"
                        >
                          Clear all
                        </button>
                      </div>
                      <ul>
                        {recentSearches.map((term) => (
                          <li key={term}>
                            <div className="flex items-center gap-1 rounded-lg hover:bg-purple-50">
                              <button
                                type="button"
                                onClick={() => handleSelect(term)}
                                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-sm text-gray-700"
                              >
                                <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                                <span className="truncate">{term}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  removeRecentSearch(term)
                                  loadRecentSearches()
                                }}
                                className="mr-2 shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                aria-label={`Remove ${term} from recent searches`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {!hasQuery && results.trending && results.trending.length > 0 && (
                    <section className="mb-2">
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Trending
                      </p>
                      <ul>
                        {results.trending.map((term) => (
                          <li key={term}>
                            <button
                              type="button"
                              onClick={() => handleSelect(term)}
                              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-purple-50"
                            >
                              <TrendingUp className="h-4 w-4 shrink-0 text-purple-500" />
                              <span className="truncate">{term}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {hasQuery && results.categories.length > 0 && (
                    <section className="mb-2">
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Categories
                      </p>
                      <ul>
                        {results.categories.map((category) => (
                          <li key={category.id}>
                            <Link
                              href={`/products?category=${category.slug}`}
                              onClick={() => {
                                saveRecentSearch(category.name)
                                setShowSuggestions(false)
                                onClose()
                              }}
                              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-purple-50"
                            >
                              {category.image_url ? (
                                <OptimizedImage
                                  src={category.image_url}
                                  alt={category.name}
                                  width={36}
                                  height={36}
                                  variant="thumbnail"
                                  className="h-9 w-9 rounded-md object-cover"
                                />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-100 text-xs font-bold text-purple-600">
                                  {category.name.charAt(0)}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-900">
                                  {category.name}
                                </p>
                                <p className="text-xs text-gray-500">in All Products</p>
                              </div>
                              <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {hasQuery && results.products.length > 0 && (
                    <section>
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Products
                      </p>
                      <ul>
                        {results.products.map((product) => (
                          <li key={product.id}>
                            <Link
                              href={`/products/${product.slug}`}
                              onClick={() => {
                                saveRecentSearch(product.name)
                                setShowSuggestions(false)
                                onClose()
                              }}
                              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-purple-50"
                            >
                              {product.images[0]?.url ? (
                                <OptimizedImage
                                  src={product.images[0].url}
                                  alt={product.name}
                                  width={44}
                                  height={56}
                                  variant="thumbnail"
                                  className="h-14 w-11 rounded-md object-cover"
                                />
                              ) : (
                                <div className="flex h-14 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                                  <Search className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-900">
                                  {product.name}
                                </p>
                                <div className="mt-0.5 flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {formatPrice(product.price)}
                                  </span>
                                  {product.compare_price &&
                                    product.compare_price > product.price && (
                                      <span className="text-xs text-gray-400 line-through">
                                        {formatPrice(product.compare_price)}
                                      </span>
                                    )}
                                </div>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {hasQuery && !hasResults && (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-gray-500">
                        No results found for &ldquo;{debouncedQuery}&rdquo;
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Try searching with different keywords
                      </p>
                    </div>
                  )}

                  {hasQuery && (
                    <button
                      type="button"
                      onClick={() => navigateToSearch(debouncedQuery)}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border-t border-gray-100 px-4 py-3 text-sm font-medium text-purple-600 hover:bg-purple-50"
                    >
                      View all results for &ldquo;{debouncedQuery}&rdquo;
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}

                  {!hasQuery && !showTrending && results.products.length > 0 && (
                    <section>
                      <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Popular Right Now
                      </p>
                      <ul>
                        {results.products.slice(0, 4).map((product) => (
                          <li key={product.id}>
                            <Link
                              href={`/products/${product.slug}`}
                              onClick={() => {
                                setShowSuggestions(false)
                                onClose()
                              }}
                              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-purple-50"
                            >
                              {product.images[0]?.url && (
                                <OptimizedImage
                                  src={product.images[0].url}
                                  alt={product.name}
                                  width={44}
                                  height={56}
                                  variant="thumbnail"
                                  className="h-14 w-11 rounded-md object-cover"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-900">
                                  {product.name}
                                </p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {formatPrice(product.price)}
                                </p>
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <Button type="submit" size="sm">
          Search
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-gray-500 hover:text-gray-700"
          aria-label="Close search"
        >
          <X className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
