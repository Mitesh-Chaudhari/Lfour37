import { createAdminClient } from '@/lib/supabase/server'
import { UsersClient } from '@/components/admin/users-client'

export default async function AdminUsersPage() {
  const supabase = await createAdminClient()

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">Manage user accounts and permissions</p>
      </div>
      <UsersClient users={users || []} />
    </div>
  )
}
