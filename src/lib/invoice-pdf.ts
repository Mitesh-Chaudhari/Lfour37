import fs from 'node:fs'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  amountInWords,
  buildInvoiceData,
  type InvoiceOrderInput,
} from '@/lib/invoice'

const GOLD = [184, 134, 11] as const
const BEIGE = [245, 236, 220] as const
const TEXT = [31, 41, 55] as const
const MUTED = [107, 114, 128] as const

/** Helvetica in jsPDF cannot render ₹ — it shows as a stray "1". */
function formatPdfInr(amount: number, decimals = 2): string {
  return `Rs. ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

function getCompanyConfig() {
  return {
    name:
      process.env.INVOICE_COMPANY_NAME ||
      'LFour37',
    legalName:
      process.env.INVOICE_COMPANY_LEGAL_NAME ||
      'Yadevi Lifestyle Private Limited',
    tagline: process.env.INVOICE_COMPANY_TAGLINE || 'Perfect People, Perfect Style',
    address:
      process.env.INVOICE_COMPANY_ADDRESS ||
      'Shop No.2, Swagat Complex, Pandit Nehru Marg, Valkeshwari, Park Colony, Jamnagar, Gujarat 361008',
    gstin: process.env.INVOICE_COMPANY_GSTIN || process.env.DELHIVERY_SELLER_GSTIN || '',
    cin: process.env.INVOICE_COMPANY_CIN || 'U14101GJ2025PTC170456',
    supportPhone: process.env.INVOICE_SUPPORT_PHONE || '+91-9978437437',
    supportEmail: process.env.INVOICE_SUPPORT_EMAIL || 'support@lfour37.com',
    website:
      process.env.INVOICE_COMPANY_WEBSITE ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://www.lfour37.com',
  }
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

  const maxWidth = 78
  const maxHeight = 78

  const ratio = Math.min(maxWidth / imgProps.width, maxHeight / imgProps.height)
  const width = imgProps.width * ratio
  const height = imgProps.height * ratio

  doc.addImage(dataUrl, 'PNG', x, y, width, height)

  return { width, height }
}

function getLastTableY(doc: jsPDF): number | undefined {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
}

export function generateInvoicePdf(order: InvoiceOrderInput): Uint8Array {
  const company = getCompanyConfig()
  const invoice = buildInvoiceData(order)
  const addr = order.shipping_address
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const headerTop = margin + 8
  let y = headerTop

  const logo = tryAddLogo(doc, margin, y)

  if (!logo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...GOLD)
    doc.text(company.name, margin, y + 18)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(company.tagline, margin, y + 34)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  const addressLines = doc.splitTextToSize(company.address, 220)
  doc.text(addressLines, pageWidth - margin, y, { align: 'right' })
  let addressHeight = addressLines.length * 10

  if (company.gstin) {
    doc.text(`GSTIN: ${company.gstin}`, pageWidth - margin, y + addressHeight, {
      align: 'right',
    })
    addressHeight += 12
  }

  if (company.cin) {
    doc.text(`CIN: ${company.cin}`, pageWidth - margin, y + addressHeight, {
      align: 'right',
    })
    addressHeight += 12
  }

  y = Math.max(
    logo ? y + logo.height + 12 : y + 44,
    headerTop + addressHeight + 8
  )

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
      formatPdfInr(line.taxableAmount),
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

  y = (getLastTableY(doc) ?? y) + 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  // doc.text('Payment terms: Immediate Payment', margin, y)
  // doc.text(`Payment Communication: ${invoice.invoiceNumber}`, margin, y + 12)
  // doc.text(
  //   `Payment method: ${order.payment_method.toUpperCase()} | Status: ${order.payment_status}`,
  //   margin,
  //   y + 24
  // )

  const totalsX = pageWidth - margin - 180
  let totalsY = y

  const totalRows = [
    ['Untaxed Amount', formatPdfInr(invoice.totals.untaxedAmount)],
    ['SGST/UTGST', formatPdfInr(invoice.totals.sgst)],
    ['CGST', formatPdfInr(invoice.totals.cgst)],
  ]

  if (invoice.totals.shippingAmount > 0) {
    totalRows.push(['Shipping', formatPdfInr(invoice.totals.shippingAmount)])
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
  doc.text(formatPdfInr(invoice.totals.total), pageWidth - margin, totalsY, {
    align: 'right',
  })

  totalsY += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...TEXT)
  const words = doc.splitTextToSize(amountInWords(invoice.totals.total), pageWidth - margin * 2)
  doc.text(words, margin, totalsY)

  totalsY += words.length * 11 + 14

  const disputeBannerHeight = 26
  doc.setFillColor(...BEIGE)
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.6)
  doc.roundedRect(margin, totalsY, pageWidth - margin * 2, disputeBannerHeight, 3, 3, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...TEXT)
  doc.text(
    'All disputes shall be subject to Jamnagar, Gujarat Judiciary only.',
    pageWidth / 2,
    totalsY + 16,
    { align: 'center' }
  )

  totalsY += disputeBannerHeight + 14
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
      formatPdfInr(row.taxableValue),
      formatPdfInr(row.sgst),
      formatPdfInr(row.cgst),
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

  let footerStartY = (getLastTableY(doc) ?? totalsY) + 20
  const footerBlockHeight = 72
  const minFooterY = pageHeight - margin - footerBlockHeight

  if (footerStartY > minFooterY) {
    doc.addPage()
    footerStartY = margin + 20
  }

  doc.setDrawColor(229, 231, 235)
  doc.line(margin, footerStartY - 8, pageWidth - margin, footerStartY - 8)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...TEXT)
  doc.text(company.legalName, pageWidth / 2, footerStartY + 4, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  const supportLines = doc.splitTextToSize(
    `If you have any questions, feel free to call customer care at ${company.supportPhone} or email ${company.supportEmail}.`,
    pageWidth - margin * 2
  )
  doc.text(supportLines, pageWidth / 2, footerStartY + 18, { align: 'center' })

  const regParts = [
    company.gstin ? `GSTIN: ${company.gstin}` : '',
    company.cin ? `CIN: ${company.cin}` : '',
    company.website,
  ].filter(Boolean)

  if (regParts.length) {
    doc.text(regParts.join(' | '), pageWidth / 2, footerStartY + 18 + supportLines.length * 10 + 4, {
      align: 'center',
    })
  }

  doc.setFontSize(8)
  doc.text('Page 1 / 1', pageWidth - margin, pageHeight - margin, { align: 'right' })

  return doc.output('arraybuffer') as unknown as Uint8Array
}
