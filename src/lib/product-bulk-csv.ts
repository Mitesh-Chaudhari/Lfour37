import type { ProductImage } from '@/types'

export const BULK_UPLOAD_COLUMNS = [
  'name',
  'slug',
  'price',
  'compare_price',
  'short_description',
  'description',
  'sku',
  'status',
  'hsn_code',
  'tags',
  'category_slug',
  'image_urls',
  'is_featured',
  'is_new_arrival',
  'is_trending',
  'list_sort_order',
  'seo_title',
  'seo_description',
  'size',
  'color',
  'color_group',
  'color_hex',
  'stock',
  'price_modifier',
  'variant_image',
] as const

export type BulkUploadColumn = (typeof BULK_UPLOAD_COLUMNS)[number]

export type BulkUploadRow = Partial<Record<BulkUploadColumn, string>>

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function parseCsv(text: string): BulkUploadRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const rows: BulkUploadRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCsvLine(line)
    const row: BulkUploadRow = {}

    headers.forEach((header, index) => {
      const value = values[index]?.trim()
      if (value) {
        row[header as BulkUploadColumn] = value
      }
    })

    rows.push(row)
  }

  return rows
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result
}

export function parseSemicolonList(value?: string): string[] {
  if (!value?.trim()) return []
  return value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseBoolean(value?: string): boolean {
  if (!value?.trim()) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

export function parseOptionalNumber(value?: string): number | null {
  if (!value?.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseProductImages(value?: string): ProductImage[] {
  return parseSemicolonList(value).map((url, position) => ({
    url,
    position,
  }))
}

export function slugifyProduct(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function generateBulkUploadTemplateCsv(): string {
  const header = BULK_UPLOAD_COLUMNS.join(',')

  const exampleProduct = [
    'Classic Cotton Tee',
    'classic-cotton-tee',
    '999',
    '1299',
    'Soft everyday cotton tee',
    'Premium cotton t-shirt for daily wear',
    'TEE-001',
    'active',
    '61091000',
    'cotton;summer',
    'men;shirts;printed-shirts',
    'https://example.com/images/tee-front.jpg;https://example.com/images/tee-back.jpg',
    'false',
    'true',
    'false',
    '10',
    'Classic Cotton Tee | Lfour37',
    'Shop the classic cotton tee online at Lfour37',
    'S',
    'Black',
    'Black',
    '#000000',
    '20',
    '0',
    '',
  ].map(escapeCsvField)

  const exampleVariant = [
    'Classic Cotton Tee',
    'classic-cotton-tee',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'M',
    'Black',
    'Black',
    '#000000',
    '15',
    '0',
    '',
  ].map(escapeCsvField)

  return [header, exampleProduct.join(','), exampleVariant.join(',')].join('\n')
}

export function downloadBulkUploadTemplate(): void {
  const csv = generateBulkUploadTemplateCsv()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'product-bulk-upload-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
