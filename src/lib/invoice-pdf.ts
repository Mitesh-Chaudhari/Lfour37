import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  amountInWords,
  buildInvoiceData,
  formatInr,
  type InvoiceOrderInput,
} from '@/lib/invoice'

const GOLD = [184, 134, 11] as const
const BEIGE = [245, 236, 220] as const
const TEXT = [31, 41, 55] as const
const MUTED = [107, 114, 128] as const

//get config
function getCompanyConfig() {
  return {
    name:
      process.env.INVOICE_COMPANY_NAME ||
      process.env.NEXT_PUBLIC_APP_NAME ||
      'Yadevi Lifestyle',
    legalName:
      process.env.INVOICE_COMPANY_LEGAL_NAME ||
      `${process.env.NEXT_PUBLIC_APP_NAME || 'Yadevi Lifestyle'} Private Limited`,
    tagline: process.env.INVOICE_COMPANY_TAGLINE || 'Perfect People, Perfect Style',
    address:
      process.env.INVOICE_COMPANY_ADDRESS ||
      '301, Shlok Heights, Sukrut Residency, Lalvadi Main Road, Jamnagar, Jamnagar 361007, Gujarat GJ, India',
    gstin: process.env.INVOICE_COMPANY_GSTIN || process.env.DELHIVERY_SELLER_GSTIN || '',
    phone: process.env.INVOICE_COMPANY_PHONE || '',
    email: process.env.INVOICE_COMPANY_EMAIL || process.env.SMTP_USER || '',
    website:
      process.env.INVOICE_COMPANY_WEBSITE ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://yadevilifestyle.com',
  }
}

export function generateInvoicePdf(order: InvoiceOrderInput): Uint8Array {
  const company = getCompanyConfig()
  const invoice = buildInvoiceData(order)
  const addr = order.shipping_address
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = 36

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...GOLD)
  doc.text(company.name, margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(company.tagline, margin, y + 14)

  doc.setFontSize(8.5)
  const addressLines = doc.splitTextToSize(company.address, 220)
  doc.text(addressLines, pageWidth - margin, y, { align: 'right' })
  let addressHeight = addressLines.length * 10
  if (company.gstin) {
    doc.text(`GSTIN: ${company.gstin}`, pageWidth - margin, y + addressHeight, {
      align: 'right',
    })
    addressHeight += 12
  }

  y = Math.max(y + 28, y + addressHeight + 10)

  doc.setFillColor(...BEIGE)
  doc.roundedRect(margin, y, pageWidth - margin * 2, 34, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...GOLD)
  doc.text(`Tax Invoice ${invoice.invoiceNumber}`, pageWidth - margin - 12, y + 22, {
    align: 'right',
  })

  y += 52

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)
  doc.text('Billing Address:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(addr.full_name || 'Customer', margin, y + 14)
  doc.setTextColor(...MUTED)
  doc.text(
  [
      [addr.address_line1, addr.address_line2].filter(Boolean).join(', '),
      [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
      addr.country || 'India',
    ]
      .filter(Boolean)
      .join('\n'),
    margin,
    y + 28
  )
  doc.text(`Place of supply: ${invoice.placeOfSupply}`, margin, y + 62)

  doc.setTextColor(...TEXT)
  doc.setFont('helvetica', 'bold')
  doc.text('Invoice Date:', pageWidth / 2 + 20, y)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.invoiceDate, pageWidth / 2 + 20, y + 14)

  doc.setFont('helvetica', 'bold')
  doc.text('Due Date:', pageWidth / 2 + 20, y + 34)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.dueDate, pageWidth / 2 + 20, y + 48)

  y += 88

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        'Description',
        'HSN/SAC',
        'Quantity',
        'Unit Price',
        'Disc.%',
        'Taxes',
        'Amount',
      ],
    ],
    body: invoice.lines.map((line) => [
      line.description,
      line.hsn,
      line.quantity.toFixed(2),
      line.unitPriceExclusive.toFixed(6),
      line.discountPercent.toFixed(2),
      line.taxLabel,
      formatInr(line.taxableAmount),
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: [...TEXT],
      lineColor: [229, 231, 235],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [...GOLD],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 150 },
      1: { halign: 'center', cellWidth: 58 },
      2: { halign: 'right', cellWidth: 52 },
      3: { halign: 'right', cellWidth: 68 },
      4: { halign: 'right', cellWidth: 42 },
      5: { halign: 'center', cellWidth: 48 },
      6: { halign: 'right', cellWidth: 72 },
    },
  })

  y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY
    ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18
    : y + 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text('Payment terms: Immediate Payment', margin, y)
  doc.text(`Payment Communication: ${invoice.invoiceNumber}`, margin, y + 12)
  doc.text(
    `Payment method: ${order.payment_method.toUpperCase()} | Status: ${order.payment_status}`,
    margin,
    y + 24
  )

  const totalsX = pageWidth - margin - 180
  let totalsY = y

  const totalRows = [
    ['Untaxed Amount', formatInr(invoice.totals.untaxedAmount)],
    ['SGST/UTGST', formatInr(invoice.totals.sgst)],
    ['CGST', formatInr(invoice.totals.cgst)],
  ]

  if (invoice.totals.shippingAmount > 0) {
    totalRows.push(['Shipping', formatInr(invoice.totals.shippingAmount)])
  }

  for (const [label, value] of totalRows) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(label, totalsX, totalsY)
    doc.setTextColor(...TEXT)
    doc.text(value, pageWidth - margin, totalsY, { align: 'right' })
    totalsY += 14
  }

  totalsY += 4
  doc.setDrawColor(...GOLD)
  doc.line(totalsX, totalsY, pageWidth - margin, totalsY)
  totalsY += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...GOLD)
  doc.text('Total', totalsX, totalsY)
  doc.text(formatInr(invoice.totals.total), pageWidth - margin, totalsY, {
    align: 'right',
  })

  totalsY += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...TEXT)
  const words = doc.splitTextToSize(amountInWords(invoice.totals.total), pageWidth - margin * 2)
  doc.text(words, margin, totalsY)

  totalsY += words.length * 11 + 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT)
  doc.text('HSN Summary', margin, totalsY)

  autoTable(doc, {
    startY: totalsY + 8,
    margin: { left: margin, right: margin },
    head: [['HSN/SAC', 'Quantity', 'Rate %', 'Taxable Value', 'SGST/UTGST', 'CGST']],
    body: invoice.hsnSummary.map((row) => [
      row.hsn,
      row.quantity.toFixed(2),
      row.ratePercent.toFixed(2),
      formatInr(row.taxableValue),
      formatInr(row.sgst),
      formatInr(row.cgst),
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 4,
      textColor: [...TEXT],
      lineColor: [229, 231, 235],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [...GOLD],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  })

  const footerY = doc.internal.pageSize.getHeight() - 42
  doc.setDrawColor(229, 231, 235)
  doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...TEXT)
  doc.text(company.legalName, pageWidth / 2, footerY, { align: 'center' })

  const footerParts = [company.phone, company.email, company.website].filter(Boolean)
  if (footerParts.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(footerParts.join(' | '), pageWidth / 2, footerY + 12, { align: 'center' })
  }

  if (company.gstin) {
    doc.text(`GSTIN: ${company.gstin}`, pageWidth / 2, footerY + 24, { align: 'center' })
  }

  doc.setFontSize(8)
  doc.text('Page 1 / 1', pageWidth - margin, footerY + 24, { align: 'right' })

  return doc.output('arraybuffer') as unknown as Uint8Array
}
