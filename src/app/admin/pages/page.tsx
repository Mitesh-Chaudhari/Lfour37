import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function AdminPages() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Manage Pages</h1>

      <div className="flex flex-col gap-3">
        <Link className='flex items-center justify-between gap-2 p-3 manage-page-link' href="/admin/pages/privacy-policy">
            Privacy Policy
            <ChevronRight />
        </Link>
        <Link className='flex items-center justify-between gap-2 p-3 manage-page-link' href="/admin/pages/return-refund">
            Return Policy
            <ChevronRight />
        </Link>
        <Link className='flex items-center justify-between gap-2 p-3 manage-page-link' href="/admin/pages/faq">
            FAQ
            <ChevronRight />
        </Link>
      </div>
    </div>
  )
}