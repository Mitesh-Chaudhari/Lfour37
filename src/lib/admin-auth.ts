import { createClient } from '@/lib/supabase/server'
import {
  hasPermission,
  isStaffRole,
  type Permission,
  type StaffRole,
} from '@/lib/admin-permissions'

export type StaffProfile = {
  id: string
  role: StaffRole
  full_name: string | null
  email: string
}

/** Any back-office role (sales, pos, warehouse, accountant, admin, super_admin). */
export async function requireStaffUser(): Promise<StaffProfile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, full_name, email, is_suspended')
    .eq('id', user.id)
    .single()

  if (
    !profile ||
    profile.is_suspended ||
    !isStaffRole(profile.role)
  ) {
    return null
  }

  return {
    id: profile.id,
    role: profile.role,
    full_name: profile.full_name,
    email: profile.email,
  }
}

export async function requirePermission(
  permission: Permission
): Promise<StaffProfile | null> {
  const profile = await requireStaffUser()
  if (!profile || !hasPermission(profile.role, permission)) return null
  return profile
}

/** Full operators only (admin / super_admin). */
export async function requireAdminUser() {
  const profile = await requireStaffUser()
  if (!profile) return null
  if (profile.role !== 'admin' && profile.role !== 'super_admin') return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
