import { createAdminClient }
from '@/lib/supabase/server'

export async function getUniqueColorGroups() {

  const supabase =
    await createAdminClient()

  const { data } =
    await supabase
      .from('product_variants')
      .select('color_group')
      .eq('is_active', true)
      .neq('color_group', null)
      .neq('color_group', '')
      .order('color_group')

  return [
    ...new Set(
      data?.map(
        (v) => v.color_group
      )
    ),
  ]
}