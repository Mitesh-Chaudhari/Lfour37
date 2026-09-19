import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/admin-shell'
import {
  getAdminSelectedBrandId,
  listBrands,
} from '@/lib/organization-server'
import { LFOUR37_BRAND_ID } from '@/lib/organization'
import { isStaffRole } from '@/lib/admin-permissions'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirectTo=/admin')

  const { data: userData } = await supabase
    .from('users')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single()

  if (!userData || !isStaffRole(userData.role)) {
    redirect('/')
  }

  let brands: Awaited<ReturnType<typeof listBrands>> = []
  let selectedBrandId = LFOUR37_BRAND_ID
  try {
    brands = await listBrands()
    selectedBrandId = await getAdminSelectedBrandId()
  } catch {
    // Migration 046 may not be applied yet — admin still works.
  }

  return (
    <AdminShell
      user={userData}
      brands={brands}
      selectedBrandId={selectedBrandId}
    >
      {children}
    </AdminShell>
  )
}
