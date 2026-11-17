import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ProductForm } from '@/components/admin/product-form'
import { getUniqueColorGroups } from '@/lib/product-colors'

import { mappingsArrayToRecord } from '@/lib/hsn'
import {
  getAdminPairingOptions,
  getCuratedPairingIds,
} from '@/lib/product-pairings'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminProductEditPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: product },
    { data: categories },
    { data: sizes },
    { data: hsnMappingRows },
    colorGroups,
  ] = await Promise.all([
    supabase
      .from('products')
      .select('*, variants:product_variants(*), categories:product_categories(category_id)')
      .eq('id', id)
      .single(),
    supabase
      .from('categories')
      .select('id, name, slug, parent_id')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('product_sizes')
      .select('name')
      .order('display_order')
      .order('name'),
    supabase
      .from('category_hsn_mappings')
      .select('category_id, hsn_code'),
    getUniqueColorGroups(),
  ])

  const hsnMappings = mappingsArrayToRecord(hsnMappingRows || [])

  if (!product) notFound()

  const [paired_product_ids, pairingOptionsRaw] = await Promise.all([
    getCuratedPairingIds(supabase, id),
    getAdminPairingOptions(supabase, {
      brandId: product.brand_id,
      excludeProductId: id,
    }),
  ])

  // Ensure already-paired products appear in the picker even if filtered out.
  const optionIds = new Set(pairingOptionsRaw.map((p) => p.id))
  const missingPairedIds = paired_product_ids.filter((pid) => !optionIds.has(pid))
  let pairingOptions = pairingOptionsRaw
  if (missingPairedIds.length) {
    const { data: missing } = await supabase
      .from('products')
      .select('id, name, slug, images, price, status')
      .in('id', missingPairedIds)
    pairingOptions = [...(missing || []), ...pairingOptionsRaw]
  }

  const productWithCategories = {
    ...product,

    category_ids: (product.categories || []).map(
      (c: { category_id: string }) => c.category_id
    ),

    variants: product.variants || [],
    paired_product_ids,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
        <p className="text-sm text-gray-500 mt-1">{product.name}</p>
      </div>
      <ProductForm
        initialData={productWithCategories}
        categories={(categories || []) as any}
        hsnMappings={hsnMappings}
        colorGroups={colorGroups}
        sizes={(sizes || []).map((size) => size.name)}
        pairingOptions={pairingOptions}
      />
    </div>
  )
}
