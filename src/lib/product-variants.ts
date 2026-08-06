export const DEFAULT_VARIANT_SIZE = 'One Size'
export const DEFAULT_VARIANT_COLOR = 'Default'

export function normalizeVariantSize(size?: string | null): string {
  const trimmed = size?.trim()
  return trimmed || DEFAULT_VARIANT_SIZE
}

export function normalizeVariantColor(color?: string | null): string {
  const trimmed = color?.trim()
  return trimmed || DEFAULT_VARIANT_COLOR
}

export function normalizeVariantColorGroup(
  colorGroup?: string | null,
  color?: string | null
): string {
  const trimmedGroup = colorGroup?.trim()
  if (trimmedGroup) return trimmedGroup
  return normalizeVariantColor(color)
}

type VariantDims = {
  size?: string | null
  color?: string | null
}

export function productHasSizeOptions(variants: VariantDims[]): boolean {
  return variants.some((variant) => Boolean(variant.size?.trim()))
}

export function productHasColorOptions(variants: VariantDims[]): boolean {
  return variants.some((variant) => Boolean(variant.color?.trim()))
}

export function isSameVariantDims(
  a: VariantDims,
  b: VariantDims,
  options: { requireSize: boolean; requireColor: boolean }
): boolean {
  const sizeMatch =
    !options.requireSize || (a.size || null) === (b.size || null)
  const colorMatch =
    !options.requireColor || (a.color || null) === (b.color || null)
  return sizeMatch && colorMatch
}

export function findVariantByDims<T extends VariantDims>(
  variants: T[],
  selection: VariantDims,
  options: { requireSize: boolean; requireColor: boolean }
): T | undefined {
  return variants.find((variant) => {
    if (options.requireSize && (variant.size || null) !== (selection.size || null)) {
      return false
    }
    if (
      options.requireColor &&
      (variant.color || null) !== (selection.color || null)
    ) {
      return false
    }
    if (!options.requireSize && !options.requireColor) {
      return (
        (variant.size || null) === (selection.size || null) &&
        (variant.color || null) === (selection.color || null)
      )
    }
    return true
  })
}
