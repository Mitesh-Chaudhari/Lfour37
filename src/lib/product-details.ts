import type { ProductKeyHighlight } from '@/types'

export type { ProductKeyHighlight }

export const DEFAULT_KEY_HIGHLIGHT_LABELS = [
  'Color',
  'Pattern',
  'Brand Fabric',
  'Fit',
  'Sleeve',
  'Collar',
] as const

/** Always starts with the 6 standard labels, then any custom extras. */
export function buildKeyHighlightsForForm(
  value: unknown
): ProductKeyHighlight[] {
  const existing = normalizeKeyHighlights(value)
  const byLabel = new Map(
    existing.map((item) => [item.label.toLowerCase(), item.value])
  )

  const defaults: ProductKeyHighlight[] = DEFAULT_KEY_HIGHLIGHT_LABELS.map(
    (label) => ({
      label,
      value: byLabel.get(label.toLowerCase()) || '',
    })
  )

  const extras = existing.filter(
    (item) =>
      !DEFAULT_KEY_HIGHLIGHT_LABELS.some(
        (label) => label.toLowerCase() === item.label.toLowerCase()
      )
  )

  return [...defaults, ...extras]
}

export const PRODUCT_WASH_CARE_ITEMS = [
  {
    id: 'machine-wash-cold',
    label: 'Machine wash cold with similar colours',
    icon: 'machine-wash-cold' as const,
  },
  {
    id: 'inside-out',
    label: 'Turn the T-shirt inside out before washing',
    icon: 'inside-out' as const,
  },
  {
    id: 'mild-detergent',
    label: 'Use mild detergent',
    icon: 'mild-detergent' as const,
  },
  {
    id: 'no-bleach',
    label: 'Do not bleach',
    icon: 'no-bleach' as const,
  },
  {
    id: 'no-iron-print',
    label: 'Do not iron directly over the print or embellishments',
    icon: 'no-iron-print' as const,
  },
  {
    id: 'dry-shade',
    label: 'Dry in shade',
    icon: 'dry-shade' as const,
  },
  {
    id: 'no-tumble-dry',
    label: 'Do not tumble dry',
    icon: 'no-tumble-dry' as const,
  },
] as const

export const PRODUCT_INFO_STATIC = {
  manufacturing: {
    title: 'Manufacturing Details',
    subtitle: 'Sold and Marketed by Yadevi Lifestyle Private Limited',
    body: 'Sold and Marketed by Yadevi Lifestyle Private Limited',
  },
  shipping: {
    title: 'Free Shipping',
    subtitle: 'We Offer shipping across India',
    body: `We offer free shipping on eligible orders across India.
Orders are typically processed within 1–2 business days and delivered through our courier partners.`,
  },
  returns: {
    title: '7 Days Return / Exchange',
    subtitle: 'Know about return & exchange policy',
    body: `You can request a return or exchange within 7 days of delivery for unused products with original tags and packaging intact.
Please visit our Return Policy page for full eligibility and process details.`,
  },
} as const

export function normalizeKeyHighlights(
  value: unknown
): ProductKeyHighlight[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const label = typeof record.label === 'string' ? record.label.trim() : ''
      const valueText =
        typeof record.value === 'string' ? record.value.trim() : ''
      if (!label || !valueText) return null
      return { label, value: valueText }
    })
    .filter((item): item is ProductKeyHighlight => Boolean(item))
}

/** Parse bulk CSV format: Label:Value;Label:Value */
export function parseKeyHighlightsCsv(value?: string): ProductKeyHighlight[] {
  if (!value?.trim()) return []

  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf(':')
      if (separatorIndex <= 0) return null
      const label = part.slice(0, separatorIndex).trim()
      const highlightValue = part.slice(separatorIndex + 1).trim()
      if (!label || !highlightValue) return null
      return { label, value: highlightValue }
    })
    .filter((item): item is ProductKeyHighlight => Boolean(item))
}
