import { NextRequest } from 'next/server'

/**
 * Authorize cron endpoints.
 * - On Vercel, platform-set `x-vercel-cron: 1` is accepted.
 * - Manual calls require a non-empty Bearer secret.
 * Off-Vercel, `x-vercel-cron` alone is not trusted (spoofable).
 */
export function isCronRequestAuthorized(
  request: NextRequest,
  secrets: Array<string | undefined>
): boolean {
  const secret = secrets.find((value) => Boolean(value))
  const authorization = request.headers.get('authorization')
  const isManualCall =
    Boolean(secret) && authorization === `Bearer ${secret}`

  if (isManualCall) return true

  const isVercelPlatform = process.env.VERCEL === '1'
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'

  return isVercelPlatform && isVercelCron
}
