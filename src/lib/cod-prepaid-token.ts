/**
 * HMAC-signed tokens for the public COD → Prepaid payment page.
 * No login required — the token encodes orderId + expiry and is signed
 * with COD_PREPAID_TOKEN_SECRET so it cannot be forged.
 */

import crypto from 'crypto'

const ALGO = 'sha256'

function getSecret(): string {
  const secret = process.env.COD_PREPAID_TOKEN_SECRET
  if (!secret) throw new Error('COD_PREPAID_TOKEN_SECRET env var is not set')
  return secret
}

export type CodPrepaidTokenPayload = {
  orderId: string
  expiresAt: string // ISO string
}

export function signCodPrepaidToken(payload: CodPrepaidTokenPayload): string {
  const data = JSON.stringify(payload)
  const b64 = Buffer.from(data).toString('base64url')
  const sig = crypto
    .createHmac(ALGO, getSecret())
    .update(b64)
    .digest('base64url')
  return `${b64}.${sig}`
}

export function verifyCodPrepaidToken(
  token: string
): CodPrepaidTokenPayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null

    const b64 = token.slice(0, dot)
    const sig = token.slice(dot + 1)

    const expectedSig = crypto
      .createHmac(ALGO, getSecret())
      .update(b64)
      .digest('base64url')

    const expected = Buffer.from(expectedSig)
    const received = Buffer.from(sig)
    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      return null
    }

    const payload: CodPrepaidTokenPayload = JSON.parse(
      Buffer.from(b64, 'base64url').toString('utf8')
    )

    if (new Date(payload.expiresAt) < new Date()) return null

    return payload
  } catch {
    return null
  }
}

export function buildCodPrepaidPaymentUrl(
  orderId: string,
  expiresAt: Date
): string {
  const token = signCodPrepaidToken({
    orderId,
    expiresAt: expiresAt.toISOString(),
  })
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    'https://lfour37.com'
  return `${base}/pay/cod-convert?token=${encodeURIComponent(token)}`
}
