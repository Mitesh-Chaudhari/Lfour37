import fs from 'node:fs'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import sharp from 'sharp'
import type { InvoiceOrderInput } from '@/lib/invoice'
import {
  buildOrderDocumentData,
  formatOrderDocumentInrPlain,
  ORDER_DOCUMENT_BRAND,
  type OrderDocumentData,
  type OrderDocumentItem,
} from '@/lib/order-document'

const TEXT = [17, 17, 17] as const
const MUTED = [102, 102, 102] as const
const LINE = [236, 236, 236] as const

type LoadedItemImage = {
  dataUrl: string
  format: 'PNG' | 'JPEG'
  width: number
  height: number
}

type LogoPlacement = {
  width: number
  height: number
}

function tryAddLogo(doc: jsPDF, x: number, y: number): LogoPlacement | null {
  const logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png')
  if (!fs.existsSync(logoPath)) return null

  const imgData = fs.readFileSync(logoPath)
  const dataUrl = `data:image/png;base64,${imgData.toString('base64')}`
  const imgProps = doc.getImageProperties(dataUrl)

  const maxWidth = 56
  const maxHeight = 56
  const ratio = Math.min(maxWidth / imgProps.width, maxHeight / imgProps.height)
  const width = imgProps.width * ratio
  const height = imgProps.height * ratio

  doc.addImage(dataUrl, 'PNG', x, y, width, height)
  return { width, height }
}

function formatPdfInr(amount: number): string {
  return formatOrderDocumentInrPlain(amount)
}

function resolveImageFormatFromBuffer(buffer: Buffer): 'PNG' | 'JPEG' | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'PNG'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'JPEG'
  return null
}

async function loadRemoteImage(url: string): Promise<LoadedItemImage | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!response.ok) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0 || buffer.length > 10_000_000) return null

    try {
      const resized = await sharp(buffer)
        .rotate()
        .resize(120, 120, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer()

      const dataUrl = `data:image/jpeg;base64,${resized.toString('base64')}`
      return {
        dataUrl,
        format: 'JPEG',
        width: 0,
        height: 0,
      }
    } catch {
      const format = resolveImageFormatFromBuffer(buffer)
      if (!format) return null

      const mime = format === 'PNG' ? 'image/png' : 'image/jpeg'
      return {
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        format,
        width: 0,
        height: 0,
      }
    }
  } catch {
    return null
  }
}

async function loadItemImages(
  items: OrderDocumentItem[]
): Promise<Map<string, LoadedItemImage>> {
  try {
    const entries = await Promise.all(
      items.map(async (item) => {
        if (!item.imageUrl) return null
        const loaded = await loadRemoteImage(item.imageUrl)
        return loaded ? ([item.imageUrl, loaded] as const) : null
      })
    )

    return new Map(entries.filter(Boolean) as Array<[string, LoadedItemImage]>)
  } catch {
    return new Map()
  }
}

function drawSectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)
  doc.text(text.toUpperCase(), x, y)
}

function drawLabelValue(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number
) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)
  doc.text(label, x, y)
  doc.setFont('helvetica', 'normal')
  doc.text(value, x + doc.getTextWidth(label) + 4, y)
}

function drawBillingRow(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  bold = false
) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(9)
  const labelColor = bold ? TEXT : MUTED
  doc.setTextColor(labelColor[0], labelColor[1], labelColor[2])
  doc.text(label, x, y)
  doc.setTextColor(...TEXT)
  doc.text(value, x + width, y, { align: 'right' })
}

function drawProductImage(
  doc: jsPDF,
  item: OrderDocumentItem,
  image: LoadedItemImage | undefined,
  x: number,
  y: number
): number {
  const box = 48

  if (image && item.imageUrl) {
    try {
      const props = doc.getImageProperties(image.dataUrl)
      const ratio = Math.min(box / props.width, box / props.height)
      const width = props.width * ratio
      const height = props.height * ratio
      doc.addImage(image.dataUrl, image.format, x, y, width, height)
      return box + 10
    } catch {
      // Fall through to placeholder box.
    }
  }

  doc.setDrawColor(...LINE)
  doc.setFillColor(243, 243, 243)
  doc.roundedRect(x, y, box, box, 3, 3, 'FD')
  return box + 10
}

function drawTssOrderSummary(
  doc: jsPDF,
  data: OrderDocumentData,
  itemImages: Map<string, LoadedItemImage>,
  margin: number,
  startY: number,
  contentWidth: number
): number {
  let y = startY
  const pageWidth = doc.internal.pageSize.getWidth()
  const rightX = pageWidth - margin
  const billingWidth = 220
  const billingX = rightX - billingWidth
  const priceColRight = rightX - 98
  const totalColRight = rightX
  const textStartX = margin
  const textWidth = contentWidth - 210

  const logo = tryAddLogo(doc, margin, y)
  y += (logo?.height || 56) + 16

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)
  doc.text(
    `Order ID: ${data.orderNumber} | Order Date: ${data.orderDate}`,
    margin,
    y
  )
  y += 18

  doc.setFontSize(11)
  doc.text(`Hey ${data.customerFirstName},`, margin, y)
  y += 16

  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  const intro = doc.splitTextToSize(
    "Hurrayyyyy! We're delighted you decided to place your order with us! We're preparing your package and will notify you as soon as it is shipped along with tracking details.",
    contentWidth
  )
  doc.text(intro, margin, y)
  y += intro.length * 11 + 14

  drawSectionTitle(doc, 'Order Details', margin, y)
  y += 14
  drawLabelValue(doc, 'ORDER ID:', data.orderNumber, margin, y)
  y += 12
  drawLabelValue(doc, 'ORDER DATE:', data.orderDate, margin, y)
  y += 18

  drawSectionTitle(doc, 'Delivery Address', margin, y)
  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)
  for (const line of data.addressLines) {
    doc.text(line, margin, y)
    y += 12
  }
  if (data.phone) {
    doc.text(`Contact No.: ${data.phone}`, margin, y)
    y += 12
  }
  y += 8

  doc.setDrawColor(...LINE)
  doc.line(margin, y, rightX, y)
  y += 16

  drawSectionTitle(doc, 'Order Summary', margin, y)
  y += 14

  if (data.estimatedDelivery) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT)
    doc.text(`Estimated Delivery by ${data.estimatedDelivery}.`, margin, y)
    y += 16
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text('Price', priceColRight, y, { align: 'right' })
  doc.text('Total', totalColRight, y, { align: 'right' })
  y += 6
  doc.setDrawColor(...LINE)
  doc.line(margin, y, rightX, y)
  y += 12

  for (const item of data.items) {
    const rowTop = y
    const imageOffset = drawProductImage(
      doc,
      item,
      item.imageUrl ? itemImages.get(item.imageUrl) : undefined,
      textStartX,
      rowTop
    )
    const productX = textStartX + imageOffset

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...TEXT)
    const nameLines = doc.splitTextToSize(item.name, textWidth - imageOffset)
    doc.text(nameLines, productX, rowTop + 10)

    const variantParts = [
      item.size ? `Size: ${item.size}` : null,
      `Qty: ${item.quantity}`,
    ].filter(Boolean)
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(
      variantParts.join(' | '),
      productX,
      rowTop + 10 + nameLines.length * 10 + 2
    )

    doc.setFontSize(9)
    doc.setTextColor(...TEXT)
    doc.text(formatPdfInr(item.unitPrice), priceColRight, rowTop + 10, {
      align: 'right',
    })
    doc.text(formatPdfInr(item.lineTotal), totalColRight, rowTop + 10, {
      align: 'right',
    })

    y = Math.max(rowTop + 58, rowTop + nameLines.length * 10 + 28)
    doc.setDrawColor(...LINE)
    doc.line(margin, y, rightX, y)
    y += 10
  }

  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)
  doc.text('Billing Details', margin, y)
  y += 14

  const { billing } = data
  drawBillingRow(
    doc,
    'Sub-total:',
    formatPdfInr(billing.subtotal),
    billingX,
    y,
    billingWidth
  )
  y += 12

  if (billing.discount > 0) {
    drawBillingRow(
      doc,
      'Discount:',
      `-${formatPdfInr(billing.discount)}`,
      billingX,
      y,
      billingWidth
    )
    y += 12
  }

  drawBillingRow(
    doc,
    'Shipping Charges:',
    billing.shippingLabel === 'FREE' ? 'FREE' : billing.shippingLabel.replace('₹', 'Rs.'),
    billingX,
    y,
    billingWidth
  )
  y += 12

  if (billing.showCodCharges) {
    drawBillingRow(
      doc,
      'COD Charges:',
      formatPdfInr(billing.codCharges),
      billingX,
      y,
      billingWidth
    )
    y += 12
  }

  drawBillingRow(
    doc,
    'Grand Total:',
    formatPdfInr(billing.grandTotal),
    billingX,
    y,
    billingWidth,
    true
  )
  y += 12
  drawBillingRow(
    doc,
    'Mode of Payment:',
    billing.paymentMode,
    billingX,
    y,
    billingWidth
  )
  y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT)
  doc.text('Have a great day!', margin, y)
  y += 12
  doc.text(ORDER_DOCUMENT_BRAND, margin, y)
  y += 18

  doc.setDrawColor(...LINE)
  doc.line(margin, y, rightX, y)
  y += 14

  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const footerLines = doc.splitTextToSize(data.companyAddress, contentWidth)
  doc.text(footerLines, margin, y)
  y += footerLines.length * 10 + 8

  if (data.supportEmail || data.supportPhone) {
    const contact = [data.supportEmail, data.supportPhone].filter(Boolean).join(' | ')
    doc.text(contact, margin, y)
    y += 12
  }

  return y
}

export async function generateInvoicePdf(
  order: InvoiceOrderInput,
  options?: { expectedDeliveryDate?: string | null }
): Promise<Uint8Array> {
  const documentData = buildOrderDocumentData(order, {
    expectedDeliveryDate: options?.expectedDeliveryDate,
  })
  const itemImages = await loadItemImages(documentData.items)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 42
  const contentWidth = pageWidth - margin * 2

  drawTssOrderSummary(doc, documentData, itemImages, margin, margin, contentWidth)

  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('Page 1 / 1', pageWidth - margin, pageHeight - margin, {
    align: 'right',
  })

  return new Uint8Array(doc.output('arraybuffer'))
}
