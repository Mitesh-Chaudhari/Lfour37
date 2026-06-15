'use client'

import Link from 'next/link'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Category } from '@/types'
import { useCategoryDrawerStore } from '@/store/category-drawer-store'
import { useMemo, useState } from 'react'

interface Props {
  categories: Category[]
}

export function CategoryDrawer({
  categories,
}: Props) {
  const { isOpen, close } =
    useCategoryDrawerStore()

  const [activeTab, setActiveTab] =
    useState('Men')
    const [expandedSection, setExpandedSection] =
  useState<string | null>(null)

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
                                border
                                rounded-xl
                                p-4
                                hover:border-purple-600
                            "
                            >
                            <div
                                className="
                                aspect-square
                                rounded-lg
                                bg-gray-100
                                mb-2
                                "
                            >
                                {item.image_url && (
                                <img
                                    src={
                                    item.image_url
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
                                )}
                            </div>

                            <p
                                className="
                                text-sm
                                font-medium
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