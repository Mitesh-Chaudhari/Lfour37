import { getItemActionStatus } from '@/lib/order-status'

interface OrderItemStatusBadgeProps {
  status?: string | null
  returnStatus?: string | null
}

function formatStatusLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function getBadgeClass(value: string): string {
  switch (value) {
    case 'cancelled':
      return 'bg-red-100 text-red-700'
    case 'cancel_requested':
      return 'bg-amber-100 text-amber-800'
    case 'return_requested':
      return 'bg-orange-100 text-orange-700'
    case 'return_approved':
      return 'bg-green-100 text-green-700'
    case 'return_rejected':
      return 'bg-red-100 text-red-700'
    case 'return_initiated':
    case 'exchange_initiated':
      return 'bg-blue-100 text-blue-700'
    case 'returned':
    case 'exchanged':
      return 'bg-gray-100 text-gray-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

export function OrderItemStatusBadge({
  status,
  returnStatus,
}: OrderItemStatusBadgeProps) {
  const displayStatus = getItemActionStatus({ status, return_status: returnStatus })

  if (!displayStatus) {
    return null
  }

  return (
    <span
      className={`text-xs px-2 py-1 rounded whitespace-nowrap ${getBadgeClass(displayStatus)}`}
    >
      {formatStatusLabel(displayStatus)}
    </span>
  )
}
