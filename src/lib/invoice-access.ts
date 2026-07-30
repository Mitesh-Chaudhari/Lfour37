type InvoiceEligibilityOrder = {
  payment_method?: string | null
  status?: string | null
  payment_status?: string | null
}

/** COD invoices only after delivery; prepaid once payment is completed. */
export function canDownloadInvoice(order: InvoiceEligibilityOrder): boolean {
  if (order.payment_method === 'cod') {
    return order.status === 'delivered'
  }

  if (order.status === 'cancelled' || order.status === 'pending') {
    return false
  }

  return (
    order.payment_status === 'completed' ||
    order.status === 'paid' ||
    order.status === 'processing' ||
    order.status === 'shipped' ||
    order.status === 'delivered' ||
    order.status === 'refunded'
  )
}
