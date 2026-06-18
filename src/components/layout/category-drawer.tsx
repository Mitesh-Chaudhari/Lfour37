'use client'

import Link from 'next/link'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Category } from '@/types'
import { useCategoryDrawerStore } from '@/store/category-drawer-store'
import { useEffect, useMemo, useState } from 'react'

interface Props {
  categories: Category[]
}
type CategoryWithPreview = Category & {
  previewImage?: string | null
}

export function CategoryDrawer({
  categories,
}: Props) {
  const { isOpen, close } =
    useCategoryDrawerStore()
    const supabase = createClient()
  const [activeTab, setActiveTab] =
    useState('Men')
    const [expandedSection, setExpandedSection] =
  useState<string | null>(null)
  const [categoryImages, setCategoryImages] =
  useState<Record<string, string>>({})

  const parentCategories =
        useMemo(
            () =>
            categories.filter(
                (c) =>
                !c.parent_id &&
                ['men', 'women']
                    .includes(
                    c.slug.toLowerCase()
                    )
            ),
            [categories]
        )

  const activeParent =
    parentCategories.find(
      (c) =>
        c.name.toLowerCase() ===
        activeTab.toLowerCase()
    )

  const getChildren = (
    parentId: string
  ) =>
    categories.filter(
      (c) =>
        c.parent_id === parentId
    )

    useEffect(() => {
        const loadCategoryImages =
            async () => {

            const {
                data,
                error,
            } =
                await supabase
                .from(
                    'product_categories'
                )
                .select(`
                    category_id,
                    products!product_categories_product_id_fkey (
                    images
                    )
                `)
            console.log(data)
            if (error) {
                console.error(error)
                return
            }

            const previews:
                Record<
                string,
                string
                > = {}

            data?.forEach((row: any) => {
                const product =
                    Array.isArray(row.products)
                    ? row.products[1]
                    : row.products

                const images =
                    product?.images

                if (
                    !previews[row.category_id] &&
                    Array.isArray(images) &&
                    images.length > 0
                ) {
                    const firstImage =
                    typeof images[1] === 'string'
                        ? images[1]
                        : images[1]?.url

                    if (firstImage) {
                    previews[row.category_id] =
                        firstImage
                    }
                }
                })

            setCategoryImages(
                previews
            )
            }

        loadCategoryImages()
        }, [])

  if (!isOpen) return null

  return (
    <>
      <div
        className="
          fixed
          inset-0
          bg-black/40
          z-[100]
        "
        onClick={close}
      />

      <div
        className="
          fixed
          top-0
          left-0
          h-full
          w-full
          max-w-[900px]
          bg-white
          z-[101]
          overflow-y-auto
          shadow-2xl
        "
      >
        <div
          className="
            flex
            items-center
            justify-between
            px-6
            py-4
            border-b
          "
        >
          <h2
            className="
              text-xl
              font-bold
            "
          >
            Categories
          </h2>

          <button
            onClick={close}
          >
            <X />
          </button>
        </div>

        {/* Tabs */}

        <div
          className="
            flex
            border-b
          "
        >
          {parentCategories.map(
            (cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  setActiveTab(
                    cat.name
                  )
                }
                className={`
                  flex-1
                  py-4
                  text-sm
                  font-semibold
                  border-b-2
                  ${
                    activeTab ===
                    cat.name
                      ? 'border-purple-600 text-white bg-purple-600'
                      : 'border-transparent text-gray-500'
                  }
                `}
              >
                {cat.name}
              </button>
            )
          )}
        </div>

        {/* Content */}

        {activeParent && (
          <div className="p-6">
            {getChildren(activeParent.id).map(
            (section) => {
                const subItems =
                getChildren(section.id)

                const expanded =
                expandedSection ===
                section.id

                return (
                <div
                    key={section.id}
                    className="
                    border-b
                    border-gray-100
                    "
                >
                    <button
                    onClick={() =>
                        setExpandedSection(
                        expanded
                            ? null
                            : section.id
                        )
                    }
                    className="
                        w-full
                        flex
                        items-center
                        justify-between
                        py-4
                    "
                    >
                    <span
                        className="
                        font-semibold
                        text-lg
                        "
                    >
                        {section.name}
                    </span>

                    <span>
                        {expanded
                        ? <ChevronUp />
                        : <ChevronDown />}
                    </span>
                    </button>

                    {expanded && (
                    <div
                        className="
                        pb-6
                        grid
                        grid-cols-2
                        md:grid-cols-4
                        gap-4
                        "
                    >
                        {subItems.map(
                        (item) => (
                            <Link
                            key={item.id}
                            href={`/products?category=${item.slug}`}
                            onClick={close}
                            className="
                            group
                            border
                            rounded-xl
                            overflow-hidden
                            bg-white
                            transition-all
                            hover:shadow-lg
                            hover:border-purple-600
                            "
                            >
                            <div
                            className="
                            aspect-square
                            rounded-lg
                            bg-gray-100
                            mb-2
                            overflow-hidden
                            flex
                            items-center
                            justify-center
                            "
                            >
                            {categoryImages[
                            item.id
                            ] ? (
                            <img
                                src={
                                categoryImages[
                                    item.id
                                ]
                                }
                                alt={
                                item.name
                                }
                                className="
                                h-full
                                w-full
                                object-cover
                                "
                            />
                            ) : (
                            <div
                                className="
                                text-center
                                text-xs
                                text-gray-400
                                px-2
                                "
                            >
                                {item.name}
                            </div>
                            )}
                            </div>

                            <p
                                className="
                                text-sm
                                font-medium
                                p-3
                                "
                            >
                                {item.name}
                            </p>
                            </Link>
                        )
                        )}
                    </div>
                    )}
                </div>
                )
            }
            )}
          </div>
        )}
      </div>
    </>
  )
}