'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { Pencil, Trash2, X, Check } from 'lucide-react'

export default function BankAccounts({
  accounts: initialAccounts,
  userId,
}: any) {
  const supabase = createClient()

  const [accounts, setAccounts] =
    useState(initialAccounts)

  const [loading, setLoading] = useState(false)

  const [editingId, setEditingId] =
    useState<string | null>(null)

  const [form, setForm] = useState({
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    ifsc: '',
  })

  // =========================
  // ADD ACCOUNT
  // =========================

  const addAccount = async () => {
    if (
      !form.account_holder_name ||
      !form.bank_name ||
      !form.account_number ||
      !form.ifsc
    ) {
      toast.error('Please fill all fields')
      return
    }

    setLoading(true)

    const isFirstAccount =
      accounts.length === 0

    const { data, error } = await supabase
      .from('user_bank_accounts')
      .insert({
        ...form,
        user_id: userId,
        is_default: isFirstAccount,
      })
      .select()
      .single()

    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    setAccounts([...accounts, data])

    toast.success('Bank account added')

    resetForm()
  }

  // =========================
  // UPDATE ACCOUNT
  // =========================

  const updateAccount = async () => {
    if (!editingId) return

    setLoading(true)

    const { data, error } = await supabase
      .from('user_bank_accounts')
      .update({
        account_holder_name:
          form.account_holder_name,
        bank_name: form.bank_name,
        account_number:
          form.account_number,
        ifsc: form.ifsc,
      })
      .eq('id', editingId)
      .select()
      .single()

    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    setAccounts(
      accounts.map((acc: any) =>
        acc.id === editingId ? data : acc
      )
    )

    toast.success('Updated successfully')

    resetForm()
  }

  // =========================
  // SET DEFAULT
  // =========================

  const setDefaultAccount = async (
    accountId: string
  ) => {
    try {
      // remove old default
      await supabase
        .from('user_bank_accounts')
        .update({
          is_default: false,
        })
        .eq('user_id', userId)

      // set new default
      const { error } = await supabase
        .from('user_bank_accounts')
        .update({
          is_default: true,
        })
        .eq('id', accountId)

      if (error) {
        toast.error(error.message)
        return
      }

      setAccounts(
        accounts.map((acc: any) => ({
          ...acc,
          is_default:
            acc.id === accountId,
        }))
      )

      toast.success(
        'Default account updated'
      )
    } catch {
      toast.error(
        'Failed to set default'
      )
    }
  }

  // =========================
  // DELETE ACCOUNT
  // =========================

  const deleteAccount = async (
    acc: any
  ) => {
    if (acc.is_default) {
      toast.error(
        'Cannot delete default account'
      )
      return
    }

    const confirmed = confirm(
      'Delete this bank account?'
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('user_bank_accounts')
      .delete()
      .eq('id', acc.id)

    if (error) {
      toast.error(error.message)
      return
    }

    setAccounts(
      accounts.filter(
        (a: any) => a.id !== acc.id
      )
    )

    toast.success('Deleted')
  }

  // =========================
  // EDIT ACCOUNT
  // =========================

  const startEdit = (acc: any) => {
    setEditingId(acc.id)

    setForm({
      account_holder_name:
        acc.account_holder_name,
      bank_name: acc.bank_name,
      account_number:
        acc.account_number,
      ifsc: acc.ifsc,
    })
  }

  // =========================
  // RESET FORM
  // =========================

  const resetForm = () => {
    setEditingId(null)

    setForm({
      account_holder_name: '',
      bank_name: '',
      account_number: '',
      ifsc: '',
    })
  }

  return (
    <div className="container mx-auto px-4 py-8">

      {/* HEADER */}
      <div className='mb-8'>
        <h1 className="text-3xl font-bold text-gray-900">
          Bank Accounts
        </h1>

        <p className="text-gray-500 mt-1">
          Manage refund bank accounts
        </p>
      </div>

      {/* FORM */}
      <div className="bg-white border rounded-2xl p-6 space-y-4">

        <div className="grid md:grid-cols-2 gap-4">

          <input
            placeholder="Account Holder Name"
            className="w-full border rounded-lg p-3"
            value={form.account_holder_name}
            onChange={(e) =>
              setForm({
                ...form,
                account_holder_name:
                  e.target.value,
              })
            }
          />

          <input
            placeholder="Bank Name"
            className="w-full border rounded-lg p-3"
            value={form.bank_name}
            onChange={(e) =>
              setForm({
                ...form,
                bank_name: e.target.value,
              })
            }
          />

          <input
            placeholder="Account Number"
            className="w-full border rounded-lg p-3"
            value={form.account_number}
            onChange={(e) =>
              setForm({
                ...form,
                account_number:
                  e.target.value,
              })
            }
          />

          <input
            placeholder="IFSC Code"
            className="w-full border rounded-lg p-3"
            value={form.ifsc}
            onChange={(e) =>
              setForm({
                ...form,
                ifsc: e.target.value,
              })
            }
          />
        </div>

        <div className="flex gap-3">

          {editingId ? (
            <>
              <Button
                onClick={updateAccount}
                loading={loading}
              >
                Update Account
              </Button>

              <Button
                variant="outline"
                onClick={resetForm}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <Button
              onClick={addAccount}
              loading={loading}
            >
              Save Account
            </Button>
          )}
        </div>
      </div>

      {/* LIST */}
      <div className="mt-6">

        {accounts.length === 0 && (
          <div className="border rounded-xl p-8 text-center text-gray-500">
            No bank accounts added yet
          </div>
        )}

        {accounts.map((acc: any) => (
          <div
            key={acc.id}
            className={`mt-3 border rounded-2xl p-5 bg-white ${
              acc.is_default
                ? 'border-green-500'
                : ''
            }`}
          >
            <div className="flex items-start justify-between gap-4">

              <div className="space-y-2">

                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">
                    {acc.account_holder_name}
                  </p>

                  {acc.is_default && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                      Default
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Bank
                  </p>

                  <p className="text-gray-800">
                    {acc.bank_name}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Account Number
                  </p>

                  <p className="text-gray-800">
                    ****
                    {acc.account_number.slice(-4)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    IFSC
                  </p>

                  <p className="text-gray-800">
                    {acc.ifsc}
                  </p>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex flex-wrap gap-2">

                {!acc.is_default && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDefaultAccount(acc.id)
                    }
                  >
                    <Check className="h-4 w-4" />
                    Set Default
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    startEdit(acc)
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    deleteAccount(acc)
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}