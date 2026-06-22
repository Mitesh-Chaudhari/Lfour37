import { HsnCodesClient } from '@/components/admin/hsn-codes-client'
import { createClient } from '@/lib/supabase/server'

export default async function AdminHsnCodesPage() {
  const supabase = await createClient()

  const [{ data: categories }, { data: mappings }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, parent_id')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('category_hsn_mappings')
      .select('id, category_id, hsn_code, created_at, updated_at')
      .order('created_at'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manage HSN Code</h1>
        <p className="mt-1 text-sm text-gray-500">
          Assign GST HSN codes to product categories. When creating or editing a product,
          selecting a category will auto-fill the matching HSN code on the product form and invoice.
        </p>
      </div>

      <HsnCodesClient
        categories={categories || []}
        mappings={mappings || []}
      />
    </div>
  )
}
