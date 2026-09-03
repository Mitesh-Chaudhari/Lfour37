import { Suspense } from 'react'
import { AdminReturnsTable } from '@/components/admin/returns-table'
import { parseAdminReturnsQuery } from '@/lib/admin-returns'
import { getAdminReturnsPage } from '@/lib/admin-returns-query'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminReturnsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const parsedQuery = parseAdminReturnsQuery(params)
  const {
    items,
    totalCount,
    pendingCount,
    page,
    totalPages,
    query,
  } = await getAdminReturnsPage(parsedQuery)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Returns & Exchanges</h1>
        <p className="text-gray-500 mt-1">
          Review customer photos and reasons in one place, then approve, reject,
          or refund. {pendingCount} request
          {pendingCount === 1 ? '' : 's'} waiting for review.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-gray-400">Loading returns…</p>}>
        <AdminReturnsTable
          items={items}
          totalCount={totalCount}
          pendingCount={pendingCount}
          page={page}
          totalPages={totalPages}
          query={query}
        />
      </Suspense>
    </div>
  )
}
