export const GST_RATE = Number(process.env.INVOICE_GST_RATE || '0.05')
export const DEFAULT_HSN_CODE = process.env.DEFAULT_HSN_CODE || '61091000'

export type InvoiceItemInput = {
  product_name: string
  quantity: number
  unit_price: number
  total_price: number
  variant_size?: string | null
  variant_color?: string | null
  hsn_code?: string | null
}

export type InvoiceOrderInput = {
  id: string
  order_number: string
  created_at: string
  subtotal: number
  discount_amount: number
  shipping_amount: number
  total: number
  coupon_code?: string | null
  payment_method: string
  payment_status: string
  shipping_address: Record<string, string>
  items: InvoiceItemInput[]
}

export type InvoiceLine = {
  description: string
  hsn: string
  quantity: number
  unitPriceExclusive: number
  discountPercent: number
  taxLabel: string
  taxableAmount: number
  sgst: number
  cgst: number
  gstAmount: number
}

export type InvoiceTotals = {
  untaxedAmount: number
  sgst: number
  cgst: number
  gstAmount: number
  shippingAmount: number
  total: number
}

export type InvoiceData = {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  placeOfSupply: string
  lines: InvoiceLine[]
  totals: InvoiceTotals
  hsnSummary: Array<{
    hsn: string
    quantity: number
    ratePercent: number
    taxableValue: number
    sgst: number
    cgst: number
  }>
}

function round2(value: number): number {
  return Number(value.toFixed(2))
}

function round6(value: number): number {
  return Number(value.toFixed(6))
}

export function getFiscalYear(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  if (month >= 4) {
    return `${String(year).slice(2)}-${String(year + 1).slice(2)}`
  }

  return `${String(year - 1).slice(2)}-${String(year).slice(2)}`
}

export function buildInvoiceNumber(orderNumber: string, createdAt: string): string {
  const date = new Date(createdAt)
  const fy = getFiscalYear(date)
  const suffix = orderNumber.split('-').pop()?.slice(0, 4).toUpperCase() || '0001'
  return `INV/${fy}/${suffix}`
}

export function formatInvoiceDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatInr(amount: number, decimals = 2): string {
  return `₹ ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function twoDigits(n: number): string {
    if (n < 20) return ones[n]
    return [tens[Math.floor(n / 10)], ones[n % 10]].filter(Boolean).join(' ')
  }

  function section(n: number, label: string): string {
    if (!n) return ''
    return `${convert(n)} ${label}`.trim()
  }

  function convert(n: number): string {
    if (n < 20) return ones[n]
    if (n < 100) return twoDigits(n)
    if (n < 1000) {
      return [section(Math.floor(n / 100), 'Hundred'), convert(n % 100)]
        .filter(Boolean)
        .join(' ')
    }
    if (n < 100000) {
      return [section(Math.floor(n / 1000), 'Thousand'), convert(n % 1000)]
        .filter(Boolean)
        .join(' ')
    }
    if (n < 10000000) {
      return [section(Math.floor(n / 100000), 'Lakh'), convert(n % 100000)]
        .filter(Boolean)
        .join(' ')
    }
    return [section(Math.floor(n / 10000000), 'Crore'), convert(n % 10000000)]
      .filter(Boolean)
      .join(' ')
  }

  const rupeeWords = convert(rupees) || 'Zero'
  const base = `${rupeeWords} Rupees`
  if (!paise) return `${base} only`
  return `${base} and ${convert(paise)} Paise only`
}

export function buildInvoiceData(order: InvoiceOrderInput): InvoiceData {
  const gstRate = GST_RATE
  const halfRate = gstRate / 2
  const subtotal = Number(order.subtotal) || 0
  const discount = Number(order.discount_amount) || 0

  const lines: InvoiceLine[] = order.items.map((item) => {
    const inclusiveLineTotal = Number(item.total_price)
    const lineDiscountShare =
      subtotal > 0 ? discount * (inclusiveLineTotal / subtotal) : 0
    const inclusiveAfterDiscount = inclusiveLineTotal - lineDiscountShare
    const taxableAmount = round2(inclusiveAfterDiscount / (1 + gstRate))
    const gstAmount = round2(inclusiveAfterDiscount - taxableAmount)
    const sgst = round2(taxableAmount * halfRate)
    const cgst = round2(taxableAmount * halfRate)
    const discountPercent =
      inclusiveLineTotal > 0
        ? round2((lineDiscountShare / inclusiveLineTotal) * 100)
        : 0

    const variant = [item.variant_size, item.variant_color]
      .filter(Boolean)
      .join(', ')

    return {
      description: variant
        ? `${item.product_name} (${variant})`
        : item.product_name,
      hsn: item.hsn_code || DEFAULT_HSN_CODE,
      quantity: item.quantity,
      unitPriceExclusive: round6(Number(item.unit_price) / (1 + gstRate)),
      discountPercent,
      taxLabel: `GST ${gstRate * 100}%`,
      taxableAmount,
      sgst,
      cgst,
      gstAmount,
    }
  })

  const untaxedAmount = round2(lines.reduce((sum, line) => sum + line.taxableAmount, 0))
  const sgst = round2(lines.reduce((sum, line) => sum + line.sgst, 0))
  const cgst = round2(lines.reduce((sum, line) => sum + line.cgst, 0))
  const gstAmount = round2(sgst + cgst)
  const shippingAmount = Number(order.shipping_amount) || 0
  const total = round2(untaxedAmount + gstAmount + shippingAmount)

  const hsnMap = new Map<
    string,
    { quantity: number; taxableValue: number; sgst: number; cgst: number }
  >()

  for (const line of lines) {
    const current = hsnMap.get(line.hsn) || {
      quantity: 0,
      taxableValue: 0,
      sgst: 0,
      cgst: 0,
    }
    current.quantity += line.quantity
    current.taxableValue += line.taxableAmount
    current.sgst += line.sgst
    current.cgst += line.cgst
    hsnMap.set(line.hsn, current)
  }

  const hsnSummary = [...hsnMap.entries()].map(([hsn, values]) => ({
    hsn,
    quantity: values.quantity,
    ratePercent: gstRate * 100,
    taxableValue: round2(values.taxableValue),
    sgst: round2(values.sgst),
    cgst: round2(values.cgst),
  }))

  const invoiceDate = formatInvoiceDate(order.created_at)
  const addr = order.shipping_address

  return {
    invoiceNumber: buildInvoiceNumber(order.order_number, order.created_at),
    invoiceDate,
    dueDate: invoiceDate,
    placeOfSupply: addr.state || 'Gujarat',
    lines,
    totals: {
      untaxedAmount,
      sgst,
      cgst,
      gstAmount,
      shippingAmount,
      total,
    },
    hsnSummary,
  }
}
