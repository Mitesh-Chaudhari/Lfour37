'use client'

import { useState } from 'react'
import { Search, Shield, Ban, CheckCircle, ChevronDown } from 'lucide-react'
import { User, UserRole } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export function UsersClient({ users: initialUsers }: { users: User[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const supabase = createClient()

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  const updateRole = async (id: string, role: UserRole) => {
    setIsLoading(id)
    const { error } = await supabase.from('users').update({ role }).eq('id', id)
    if (!error) {
      setUsers(users.map((u) => u.id === id ? { ...u, role } : u))
      toast.success('Role updated')
    } else {
      toast.error('Failed to update role')
    }
    setIsLoading(null)
  }

  const toggleSuspend = async (id: string, isSuspended: boolean) => {
    setIsLoading(id)
    const { error } = await supabase.from('users').update({ is_suspended: !isSuspended }).eq('id', id)
    if (!error) {
      setUsers(users.map((u) => u.id === id ? { ...u, is_suspended: !isSuspended } : u))
      toast.success(isSuspended ? 'User reactivated' : 'User suspended')
    } else {
      toast.error('Failed to update user')
    }
    setIsLoading(null)
  }

  const roleBadgeVariant = (role: UserRole) => {
    if (role === 'super_admin') return 'destructive'
    if (role === 'admin') return 'warning'
    return 'secondary'
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <select
          className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="customer">Customer</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Joined</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600 flex-shrink-0">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{user.full_name || '—'}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={roleBadgeVariant(user.role)}>
                      {user.role.replace('_', ' ')}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.is_suspended ? 'destructive' : 'success'}>
                    {user.is_suspended ? 'Suspended' : 'Active'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{formatDate(user.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="relative group">
                      <button
                        disabled={isLoading === user.id}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Shield className="h-3 w-3" />
                        Role
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-10 hidden group-hover:block min-w-[130px]">
                        {(['customer', 'admin', 'super_admin'] as UserRole[]).map((role) => (
                          <button
                            key={role}
                            onClick={() => updateRole(user.id, role)}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${user.role === role ? 'text-purple-600 font-medium' : 'text-gray-700'}`}
                          >
                            {role.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleSuspend(user.id, user.is_suspended)}
                      disabled={isLoading === user.id}
                      className={`p-1.5 transition-colors disabled:opacity-50 ${user.is_suspended ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-red-600'}`}
                      title={user.is_suspended ? 'Reactivate' : 'Suspend'}
                    >
                      {user.is_suspended ? <CheckCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-400">No users found</div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-right">{filtered.length} of {users.length} users</p>
    </div>
  )
}
