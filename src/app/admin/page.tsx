import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppsLauncherClient } from '@/components/admin/apps-launcher-client'
import { isStaffRole } from '@/lib/admin-permissions'

export const dynamic = 'force-dynamic'

export default async function AdminAppsHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/admin')

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !isStaffRole(profile.role)) redirect('/')

  return (
    <AppsLauncherClient
      role={profile.role}
      userName={profile.full_name || ''}
    />
  )
}
