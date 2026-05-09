'use client'

import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export function ProductBulkUpload() {
  const [isUploading, setIsUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const slugify = (str: string) =>
    str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }

    setIsUploading(true)
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map((h) => h.trim())

    const supabase = createClient()

    let successCount = 0
    let errorCount = 0

    const productCache: Record<string, any> = {}

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map((v) => v.trim())
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => {
          row[h] = values[idx] || ''
        })

        if (!row.name || !row.price) continue

        const productSlug = row.slug || slugify(row.name)

        let product = productCache[productSlug]

        // CREATE PRODUCT ONLY ONCE
        if (!product) {
          const { data, error } = await supabase
            .from('products')
            .insert({
              name: row.name,
              slug: productSlug,
              price: Number(row.price),
              compare_price: row.compare_price ? Number(row.compare_price) : null,
              description: row.description || null,
              sku: row.sku || null,
              status: (row.status || 'draft') as 'active' | 'inactive' | 'draft',
              images: [],
              tags: row.tags ? row.tags.split(';') : [],
            })
            .select()
            .single()

          if (error || !data) {
            errorCount++
            continue
          }

          product = data
          productCache[productSlug] = product

          // CATEGORY HANDLING
          if (row.category_slug) {
            const categorySlugs = row.category_slug.split(';').map(slugify)

            let parentId: string | null = null

            for (let j = 0; j < categorySlugs.length; j++) {
              const slug = categorySlugs[j]

              let { data: category } = await supabase
                .from('categories')
                .select('id')
                .eq('slug', slug)
                .single()

              if (!category) {
                const { data: newCat } = await supabase
                  .from('categories')
                  .insert({
                    name: slug,
                    slug,
                    parent_id: parentId,
                    is_active: true,
                  })
                  .select()
                  .single()

                category = newCat as typeof category
              }

              if (j === categorySlugs.length - 1 && category) {
                await supabase.from('product_categories').insert({
                  product_id: product.id,
                  category_id: category.id,
                })
              }

              if (category) {
                parentId = category.id
              }
            }
          }
        }

        // CREATE VARIANT
        if (row.size && row.color) {
          const { error: variantError } = await supabase
            .from('product_variants')
            .upsert(
              {
                product_id: product.id,
                size: row.size,
                color: row.color,
                color_hex: row.color_hex || '#000000',
                stock: Number(row.stock || 0),
                price_modifier: Number(row.price_modifier || 0),
                image_url: row.variant_image || null,
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
      } catch (err) {
        console.error(err)
        errorCount++
      }
    }

    toast.success(
      `Uploaded ${successCount} rows${
        errorCount > 0 ? `, ${errorCount} errors` : ''
      }`
    )

    setIsUploading(false)
    if (fileRef.current) fileRef.current.value = ''
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