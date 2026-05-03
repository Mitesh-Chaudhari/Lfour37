'use client'

import { Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

export function AdminProductDeleteButton({ productId }: { productId: string }) {
  const router = useRouter()

  const handleDelete = async () => {
    const confirmDelete = confirm('Are you sure you want to delete this product?')

    if (!confirmDelete) return
    console.log("productId",productId);
    
    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error()

      toast.success('Product deleted successfully')
      router.refresh()
    } catch {
      toast.error('Failed to delete product')
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
      title="Delete"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}