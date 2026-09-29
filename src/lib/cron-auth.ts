import { NextRequest } from 'next/server'

/**
 * Authorize cron endpoints.
 * - Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that env var is set.
 * - Route-specific bearer secrets are also accepted (manual triggers).
 * - On Vercel, `x-vercel-cron: 1` is accepted when no bearer matched.
 * Off-Vercel, `x-vercel-cron` alone is not trusted (spoofable).
 */
export function isCronRequestAuthorized(
  request: NextRequest,
  secrets: Array<string | undefined>
): boolean {
  const authorization = request.headers.get('authorization')
  const accepted = [process.env.CRON_SECRET, ...secrets].filter(
    (value): value is string => Boolean(value && value.trim())
  )

  if (
    authorization &&
    accepted.some((secret) => authorization === `Bearer ${secret}`)
  ) {
    return true
  }

  const isVercelPlatform = process.env.VERCEL === '1'
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'

  return isVercelPlatform && isVercelCron
}
