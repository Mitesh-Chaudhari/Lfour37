import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { AdminOrdersTable } from '@/components/admin/orders-table'
import { cancelExpiredUnpaidOrders } from '@/lib/cancel-unpaid-orders'
import { parseAdminOrdersQuery } from '@/lib/admin-orders'
import { getAdminOrdersPage } from '@/lib/admin-orders-query'
import { ADMIN_ORDERS_PAGE_SIZE } from '@/lib/admin-orders'
import logger from '@/lib/logger'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  try {
    await cancelExpiredUnpaidOrders(createAdminClient(), { limit: 100 })
  } catch (error) {
    logger.warn('Failed to auto-cancel unpaid pending orders on admin load', {
      error,
    })
  }

  const params = await searchParams
  const parsedQuery = parseAdminOrdersQuery(params)
  const {
    orders,
    totalCount,
    totalOrders,
    page,
    totalPages,
    query,
  } = await getAdminOrdersPage(parsedQuery)

  const hasFilters = query.q !== '' || query.status !== 'all'
  const rangeStart =
    totalCount === 0 ? 0 : (page - 1) * ADMIN_ORDERS_PAGE_SIZE + 1
  const rangeEnd = Math.min(page * ADMIN_ORDERS_PAGE_SIZE, totalCount)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
        <p className="text-gray-500 mt-1">
          {hasFilters
            ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount} matching orders`
            : `${totalOrders} orders total · ${ADMIN_ORDERS_PAGE_SIZE} per page`}
          {' · '}
          Forward shipped/delivered, cancellations, and return/exchange pickups
          sync from Delhivery or DTDC
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-gray-400">Loading orders…</p>}>
        <AdminOrdersTable
          orders={orders}
          totalCount={totalCount}
          totalOrders={totalOrders}
          page={page}
          totalPages={totalPages}
          query={query}
        />
      </Suspense>
    </div>
  )
}
