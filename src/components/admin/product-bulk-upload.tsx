'use client'

import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  downloadBulkUploadTemplate,
  parseBoolean,
  parseCsv,
  parseOptionalNumber,
  parseProductImages,
  parseSemicolonList,
  slugifyProduct,
  type BulkUploadRow,
} from '@/lib/product-bulk-csv'
import toast from 'react-hot-toast'

type ProductRecord = {
  id: string
  slug: string
}

type CategoryIdRecord = {
  id: string
}

async function getOrCreateCategory(
  supabase: ReturnType<typeof createClient>,
  slug: string,
  parentId: string | null
): Promise<CategoryIdRecord> {
  const { data: existingCategory, error: fetchError } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (fetchError) {
    throw fetchError
  }

  if (existingCategory) {
    return existingCategory
  }

  const { data: createdCategory, error: createError } = await supabase
    .from('categories')
    .insert({
      name: slug.replace(/-/g, ' '),
      slug,
      parent_id: parentId,
      is_active: true,
    })
    .select('id')
    .single()

  if (createError || !createdCategory) {
    throw createError ?? new Error(`Failed to create category: ${slug}`)
  }

  return createdCategory
}

async function linkProductCategory(
  supabase: ReturnType<typeof createClient>,
  productId: string,
  categorySlugPath?: string
) {
  if (!categorySlugPath?.trim()) return

  const categorySlugs = parseSemicolonList(categorySlugPath).map(slugifyProduct)
  if (categorySlugs.length === 0) return

  let parentId: string | null = null

  for (let index = 0; index < categorySlugs.length; index++) {
    const slug = categorySlugs[index]
    const category = await getOrCreateCategory(supabase, slug, parentId)

    if (index === categorySlugs.length - 1) {
      await supabase.from('product_categories').upsert(
        {
          product_id: productId,
          category_id: category.id,
        },
        { onConflict: 'product_id,category_id' }
      )
    }

    parentId = category.id
  }
}

function buildProductInsert(row: BulkUploadRow, productSlug: string) {
  const listSortOrder = parseOptionalNumber(row.list_sort_order)
  const comparePrice = parseOptionalNumber(row.compare_price)

  return {
    name: row.name!,
    slug: productSlug,
    price: Number(row.price),
    compare_price: comparePrice != null && comparePrice > 0 ? comparePrice : null,
    description: row.description || null,
    short_description: row.short_description || null,
    sku: row.sku || null,
    hsn_code: row.hsn_code?.trim() || null,
    status: (row.status || 'draft') as 'active' | 'inactive' | 'draft',
    images: parseProductImages(row.image_urls),
    tags: parseSemicolonList(row.tags),
    is_featured: parseBoolean(row.is_featured),
    is_new_arrival: parseBoolean(row.is_new_arrival),
    is_trending: parseBoolean(row.is_trending),
    list_sort_order: listSortOrder,
    seo_title: row.seo_title || null,
    seo_description: row.seo_description || null,
  }
}

export function ProductBulkUpload() {
  const router = useRouter()
  const [isUploading, setIsUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }

    setIsUploading(true)

    try {
      const rows = parseCsv(await file.text())
      if (rows.length === 0) {
        toast.error('CSV file is empty or invalid')
        return
      }

      const supabase = createClient()
      const productCache: Record<string, ProductRecord> = {}
      let successCount = 0
      let errorCount = 0

      for (const row of rows) {
        try {
          const productSlug =
            row.slug?.trim() || (row.name ? slugifyProduct(row.name) : '')

          if (!productSlug) {
            errorCount++
            continue
          }

          let product = productCache[productSlug]

          if (!product) {
            if (!row.name?.trim() || !row.price?.trim()) {
              errorCount++
              continue
            }

            const productData = buildProductInsert(row, productSlug)

            if (productData.list_sort_order != null) {
              const { data: duplicateSort } = await supabase
                .from('products')
                .select('id')
                .eq('list_sort_order', productData.list_sort_order)
                .maybeSingle()

              if (duplicateSort) {
                console.error(
                  `Duplicate list_sort_order: ${productData.list_sort_order}`
                )
                errorCount++
                continue
              }
            }

            const { data, error } = await supabase
              .from('products')
              .insert(productData)
              .select('id, slug')
              .single()

            if (error || !data) {
              console.error(error)
              errorCount++
              continue
            }

            product = data
            productCache[productSlug] = product

            try {
              await linkProductCategory(supabase, product.id, row.category_slug)
            } catch (categoryError) {
              console.error(categoryError)
              errorCount++
              continue
            }
          }

          if (row.size?.trim() && row.color?.trim()) {
            const { error: variantError } = await supabase
              .from('product_variants')
              .upsert(
                {
                  product_id: product.id,
                  size: row.size.trim(),
                  color: row.color.trim(),
                  color_group: row.color_group?.trim() || row.color.trim(),
                  color_hex: row.color_hex?.trim() || '#000000',
                  stock: Number(row.stock || 0),
                  price_modifier: Number(row.price_modifier || 0),
                  image_url: row.variant_image?.trim() || null,
                  is_active: true,
                },
                {
                  onConflict: 'product_id,size,color',
                }
              )

            if (variantError) {
              console.error(variantError)
              errorCount++
              continue
            }
          }

          successCount++
        } catch (rowError) {
          console.error(rowError)
          errorCount++
        }
      }

      if (successCount === 0) {
        toast.error(
          errorCount > 0
            ? `Upload failed for all ${errorCount} rows`
            : 'No valid rows found in CSV'
        )
      } else {
        toast.success(
          `Uploaded ${successCount} row${successCount === 1 ? '' : 's'}${
            errorCount > 0 ? `, ${errorCount} error${errorCount === 1 ? '' : 's'}` : ''
          }`
        )
        router.refresh()
      }
    } catch (error) {
      console.error(error)
      toast.error('Failed to process CSV file')
    } finally {
      setIsUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <input
        type="file"
        accept=".csv"
        ref={fileRef}
        onChange={handleFileChange}
        className="hidden"
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={downloadBulkUploadTemplate}
      >
        <Download className="h-4 w-4" /> Download Template
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        loading={isUploading}
      >
        <Upload className="h-4 w-4" /> Bulk Upload CSV
      </Button>
    </>
  )
}
