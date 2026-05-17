export function normalizePhone(
  phone: string
) {
  let cleaned =
    phone.replace(/\D/g, '')

  if (!cleaned.startsWith('91')) {
    cleaned = `91${cleaned}`
  }

  return cleaned
}