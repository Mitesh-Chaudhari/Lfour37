import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabaseAdmin = await createAdminClient()
  const supabaseUser = await createClient()

  const { id: productId } = await context.params

  console.log('Deleting product:', productId)

  if (!productId || productId === 'undefined') {
    return NextResponse.json(
      { error: 'Invalid product id' },
      { status: 400 }
    )
  }

  // Auth check
  const { data: { user } } = await supabaseUser.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Role check
  const { data: userData } = await supabaseUser
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'super_admin'].includes(userData?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete related data first
  await supabaseAdmin.from('product_variants').delete().eq('product_id', productId)
  await supabaseAdmin.from('product_categories').delete().eq('product_id', productId)
  await supabaseAdmin.from('reviews').delete().eq('product_id', productId)
  await supabaseAdmin.from('wishlist').delete().eq('product_id', productId)

  // Delete main product
  const { error } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', productId)

  if (error) {
    console.error(error)
    return NextResponse.json({ error }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}