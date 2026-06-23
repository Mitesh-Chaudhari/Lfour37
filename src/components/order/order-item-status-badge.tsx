interface OrderItemStatusBadgeProps {
  status?: string | null
  returnStatus?: string | null
}

function formatStatusLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function OrderItemStatusBadge({
  status,
  returnStatus,
}: OrderItemStatusBadgeProps) {
  if (returnStatus) {
    const returnClass =
      returnStatus === 'return_requested'
        ? 'bg-orange-100 text-orange-700'
        : returnStatus === 'return_approved'
          ? 'bg-green-100 text-green-700'
          : returnStatus === 'return_rejected'
            ? 'bg-red-100 text-red-700'
            : 'bg-gray-100 text-gray-700'

    return (
      <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${returnClass}`}>
        {formatStatusLabel(returnStatus)}
      </span>
    )
  }

  if (status === 'cancelled') {
    return (
      <span className="text-xs px-2 py-1 rounded whitespace-nowrap bg-red-100 text-red-700">
        Cancelled
      </span>
    )
  }

  if (status === 'cancel_requested') {
    return (
      <span className="text-xs px-2 py-1 rounded whitespace-nowrap bg-amber-100 text-amber-800">
        Cancel Requested
      </span>
    )
  }

  return null
}
