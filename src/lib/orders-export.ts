/** Build Excel-compatible SpreadsheetML (.xls) without external deps. */

export type OrdersExportRow = Record<string, string | number | null | undefined>

export const ORDERS_EXPORT_COLUMNS = [
  'Order Number',
  'Order Date',
  'Order Status',
  'Payment Method',
  'Payment Status',
  'Customer Name',
  'Customer Email',
  'Customer Phone',
  'Shipping Name',
  'Shipping Phone',
  'Address Line 1',
  'Address Line 2',
  'City',
  'State',
  'Postal Code',
  'Country',
  'Product Name',
  'SKU',
  'Size',
  'Color',
  'Quantity',
  'Unit Price',
  'Item Total',
  'Item Status',
  'Return Status',
  'Return Type',
  'Return Reason',
  'Exchange Size',
  'Exchange Color',
  'Refund Method',
  'Refund Status',
  'Refunded Amount',
  'Bank Holder',
  'Bank Name',
  'Bank Account',
  'Bank IFSC',
  'Seal Tag Image',
  'Subtotal',
  'Discount',
  'Tax',
  'Shipping',
  'Order Total',
  'Coupon Code',
  'Tracking Number',
  'Delhivery AWB',
  'Delhivery Status',
  'Delhivery ETA',
  'Reverse AWB',
  'Exchange Forward AWB',
  'Reverse Pickup Status',
  'Shipped At',
  'Delivered At',
  'Cancelled At',
  'Notes',
  'Order ID',
  'Item ID',
] as const

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cellXml(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return `<Cell><Data ss:Type="String"></Data></Cell>`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
  }

  return `<Cell><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`
}

export function buildOrdersSpreadsheetXml(rows: OrdersExportRow[]): string {
  const header = `<Row>${ORDERS_EXPORT_COLUMNS.map((col) =>
    cellXml(col)
  ).join('')}</Row>`

  const body = rows
    .map(
      (row) =>
        `<Row>${ORDERS_EXPORT_COLUMNS.map((col) => cellXml(row[col])).join(
          ''
        )}</Row>`
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>Orders Export</Title>
 </DocumentProperties>
 <Worksheet ss:Name="Orders">
  <Table>
${header}
${body}
  </Table>
 </Worksheet>
</Workbook>`
}

function formatExportDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function asAddress(value: unknown): {
  full_name?: string
  phone?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
} {
  if (!value || typeof value !== 'object') return {}
  return value as {
    full_name?: string
    phone?: string
    address_line1?: string
    address_line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
}

function asBank(value: unknown): {
  account_holder_name?: string | null
  bank_name?: string | null
  account_number?: string | null
  ifsc?: string | null
} {
  if (!value || typeof value !== 'object') return {}
  return value as {
    account_holder_name?: string | null
    bank_name?: string | null
    account_number?: string | null
    ifsc?: string | null
  }
}

type ExportOrder = {
  id: string
  order_number: string
  status?: string | null
  payment_method?: string | null
  payment_status?: string | null
  subtotal?: number | null
  discount_amount?: number | null
  tax_amount?: number | null
  shipping_amount?: number | null
  total?: number | null
  coupon_code?: string | null
  tracking_number?: string | null
  notes?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  created_at?: string | null
  shipping_address?: unknown
  user?: {
    full_name?: string | null
    email?: string | null
    phone?: string | null
  } | null
  items?: Array<{
    id: string
    product_name?: string | null
    quantity?: number | null
    unit_price?: number | null
    total_price?: number | null
    variant_size?: string | null
    variant_color?: string | null
    status?: string | null
    return_status?: string | null
    return_type?: string | null
    return_custom_reason?: string | null
    return_reason?: { label?: string | null } | null
    exchange_size?: string | null
    exchange_color?: string | null
    refund_method?: string | null
    refund_status?: string | null
    refunded_amount?: number | null
    bank_account?: unknown
    seal_tag_image_url?: string | null
    variant?: { sku?: string | null } | null
    product?: { sku?: string | null } | null
  }> | null
  delhivery_shipment?:
    | {
        awb?: string | null
        status?: string | null
        expected_delivery_date?: string | null
      }
    | Array<{
        awb?: string | null
        status?: string | null
        expected_delivery_date?: string | null
      }>
    | null
  delhivery_reverse_pickups?:
    | Array<{
        order_item_id?: string | null
        awb?: string | null
        exchange_forward_awb?: string | null
        status?: string | null
      }>
    | {
        order_item_id?: string | null
        awb?: string | null
        exchange_forward_awb?: string | null
        status?: string | null
      }
    | null
}

function getShipment(order: ExportOrder) {
  const shipment = order.delhivery_shipment
  if (Array.isArray(shipment)) return shipment[0] || null
  return shipment || null
}

function getReversePickups(order: ExportOrder) {
  const pickups = order.delhivery_reverse_pickups
  if (!pickups) return []
  return Array.isArray(pickups) ? pickups : [pickups]
}

export function ordersToExportRows(orders: ExportOrder[]): OrdersExportRow[] {
  const rows: OrdersExportRow[] = []

  for (const order of orders) {
    const addr = asAddress(order.shipping_address)
    const shipment = getShipment(order)
    const reversePickups = getReversePickups(order)
    const items = order.items?.length ? order.items : [null]

    for (const item of items) {
      const reverse = reversePickups.find(
        (pickup) => pickup.order_item_id === item?.id
      )
      const bank = asBank(item?.bank_account)
      const sku =
        item?.variant?.sku?.trim() || item?.product?.sku?.trim() || ''

      rows.push({
        'Order Number': order.order_number,
        'Order Date': formatExportDate(order.created_at),
        'Order Status': order.status || '',
        'Payment Method': order.payment_method || '',
        'Payment Status': order.payment_status || '',
        'Customer Name': order.user?.full_name || '',
        'Customer Email': order.user?.email || '',
        'Customer Phone': order.user?.phone || addr.phone || '',
        'Shipping Name': addr.full_name || '',
        'Shipping Phone': addr.phone || '',
        'Address Line 1': addr.address_line1 || '',
        'Address Line 2': addr.address_line2 || '',
        City: addr.city || '',
        State: addr.state || '',
        'Postal Code': addr.postal_code || '',
        Country: addr.country || '',
        'Product Name': item?.product_name || '',
        SKU: sku,
        Size: item?.variant_size || '',
        Color: item?.variant_color || '',
        Quantity: item?.quantity ?? '',
        'Unit Price': item?.unit_price ?? '',
        'Item Total': item?.total_price ?? '',
        'Item Status': item?.status || '',
        'Return Status': item?.return_status || '',
        'Return Type': item?.return_type || '',
        'Return Reason':
          item?.return_reason?.label || item?.return_custom_reason || '',
        'Exchange Size': item?.exchange_size || '',
        'Exchange Color': item?.exchange_color || '',
        'Refund Method': item?.refund_method || '',
        'Refund Status': item?.refund_status || '',
        'Refunded Amount': item?.refunded_amount ?? '',
        'Bank Holder': bank.account_holder_name || '',
        'Bank Name': bank.bank_name || '',
        'Bank Account': bank.account_number || '',
        'Bank IFSC': bank.ifsc || '',
        'Seal Tag Image': item?.seal_tag_image_url || '',
        Subtotal: order.subtotal ?? '',
        Discount: order.discount_amount ?? '',
        Tax: order.tax_amount ?? '',
        Shipping: order.shipping_amount ?? '',
        'Order Total': order.total ?? '',
        'Coupon Code': order.coupon_code || '',
        'Tracking Number': order.tracking_number || '',
        'Delhivery AWB': shipment?.awb || order.tracking_number || '',
        'Delhivery Status': shipment?.status || '',
        'Delhivery ETA': formatExportDate(shipment?.expected_delivery_date),
        'Reverse AWB': reverse?.awb || '',
        'Exchange Forward AWB': reverse?.exchange_forward_awb || '',
        'Reverse Pickup Status': reverse?.status || '',
        'Shipped At': formatExportDate(order.shipped_at),
        'Delivered At': formatExportDate(order.delivered_at),
        'Cancelled At': formatExportDate(order.cancelled_at),
        Notes: order.notes || '',
        'Order ID': order.id,
        'Item ID': item?.id || '',
      })
    }
  }

  return rows
}
