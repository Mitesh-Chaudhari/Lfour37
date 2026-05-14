import BankAccounts from '@/components/account/bank-accounts'
import { createClient } from '@/lib/supabase/server'

export default async function BankAccountsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('user_bank_accounts')
    .select('*')
    .eq('user_id', user?.id)

  return (
    <BankAccounts
      accounts={data || []}
      userId={user?.id}
    />
  )
}