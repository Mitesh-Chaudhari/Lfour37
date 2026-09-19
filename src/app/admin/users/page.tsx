import { createAdminClient } from '@/lib/supabase/server'
import { UsersClient } from '@/components/admin/users-client'
import { requirePermission } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'

export default async function AdminUsersPage() {
  const staff = await requirePermission('users')
  if (!staff) redirect('/admin')

  const supabase = await createAdminClient()

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users &amp; Roles</h1>
        <p className="text-sm text-gray-500 mt-1">
          Assign staff roles: Sales, POS, Warehouse, Accountant, Admin
        </p>
      </div>
      <UsersClient users={users || []} />
    </div>
  )
}
