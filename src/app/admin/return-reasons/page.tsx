import ReturnReasonsTable from '@/components/admin/return-reasons-table'
import { createClient } from '@/lib/supabase/server'

export default async function ReturnReasonsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('return_reasons')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Return Reasons
        </h1>
      </div>

      <ReturnReasonsTable reasons={data || []} />
    </div>
  )
}