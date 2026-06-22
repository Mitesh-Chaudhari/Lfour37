'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { getCategorySectionGroups } from '@/lib/categories'
import { buildCategoryPreviewMap } from '@/lib/product-images'
import { createClient } from '@/lib/supabase/client'
import { Category } from '@/types'
import { useCategoryDrawerStore } from '@/store/category-drawer-store'
import { useEffect, useMemo, useState } from 'react'

interface Props {
  categories: Category[]
}

export function CategoryDrawer({ categories }: Props) {
  const { isOpen, close } = useCategoryDrawerStore()
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState('Men')
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({})
  const [loadingImages, setLoadingImages] = useState(true)

  const parentCategories = useMemo(
    () =>
      categories
        .filter(
          (category) =>
            !category.parent_id &&
            category.is_active !== false &&
            ['men', 'women'].includes(category.slug.toLowerCase())
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  )

  const activeParent = parentCategories.find(
    (category) => category.name.toLowerCase() === activeTab.toLowerCase()
  )

  const sectionGroups = useMemo(
    () => (activeParent ? getCategorySectionGroups(activeParent.id, categories) : []),
    [activeParent, categories]
  )

  useEffect(() => {
    if (!isOpen || categories.length === 0) return

    const loadCategoryImages = async () => {
      setLoadingImages(true)
      try {
        const { data, error } = await supabase
          .from('product_categories')
          .select(`
            category_id,
            products!inner (
              images,
              status,
              is_featured,
              created_at,
              variants:product_variants (
                image_url,
                is_active
              )
            )
          `)
          .eq('products.status', 'active')

        if (error) {
          console.error(error)
          return
        }

        setCategoryImages(buildCategoryPreviewMap(data || [], categories))
      } finally {
        setLoadingImages(false)
      }
    }

    loadCategoryImages()
  }, [isOpen, categories])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[100]" onClick={close} />

      <div className="fixed top-0 left-0 h-full w-full max-w-[900px] bg-white z-[101] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold">Categories</h2>
          <button onClick={close} aria-label="Close categories">
            <X />
          </button>
        </div>

        <div className="flex border-b">
          {parentCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveTab(category.name)}
              className={`flex-1 py-4 text-sm font-semibold border-b-2 ${
                activeTab === category.name
                  ? 'border-purple-600 text-white bg-purple-600'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {activeParent && (
          <div className="p-6 space-y-8">
            {sectionGroups.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No categories available yet.
              </p>
            ) : (
              sectionGroups.map(({ section, items }) => {
                const showSectionHeader =
                  items.length > 1 || items[0]?.id !== section.id

                return (
                  <section key={section.id}>
                    {showSectionHeader && (
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">
                          {section.name}
                        </h3>
                        <Link
                          href={`/products?category=${section.slug}`}
                          onClick={close}
                          className="text-sm font-medium text-purple-600 hover:text-purple-700"
                        >
                          View all
                        </Link>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {items.map((item) => (
                        <Link
                          key={item.id}
                          href={`/products?category=${item.slug}`}
                          onClick={close}
                          className="group border rounded-xl overflow-hidden bg-white transition-all hover:shadow-lg hover:border-purple-600"
                        >
                          <div className="aspect-square rounded-lg bg-gray-100 mb-2 overflow-hidden relative flex items-center justify-center mx-2 mt-2">
                            {loadingImages ? (
                              <div className="h-full w-full animate-pulse bg-gray-200" />
                            ) : categoryImages[item.id] ? (
                              <OptimizedImage
                                src={categoryImages[item.id]}
                                alt={item.name}
                                fill
                                variant="category"
                                className="object-cover"
                              />
                            ) : (
                              <div className="text-center text-xs text-gray-400 px-2">
                                {item.name}
                              </div>
                            )}
                          </div>

                          <p className="text-sm font-medium p-3 pt-1">{item.name}</p>
                        </Link>
                      ))}
                    </div>
                  </section>
                )
              })
            )}
          </div>
        )}
      </div>
    </>
  )
}
