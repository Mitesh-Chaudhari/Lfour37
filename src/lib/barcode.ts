/** Client-safe barcode helpers (no server imports). */

export function generateVariantBarcode(input: {
  brandSlug: string
  productSku?: string | null
  size: string
  color: string
  variantId: string
}): string {
  const base = [
    input.brandSlug.slice(0, 3).toUpperCase(),
    (input.productSku || 'SKU')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase(),
    input.size.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
    input.color.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase(),
    input.variantId.replace(/-/g, '').slice(-4).toUpperCase(),
  ].join('')
  return base.slice(0, 24)
}
