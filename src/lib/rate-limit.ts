import { NextRequest, NextResponse } from 'next/server'

interface RateLimitConfig {
  max: number
  windowMs: number
}

const store = new Map<string, { count: number; resetTime: number }>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  store.forEach((value, key) => {
    if (value.resetTime < now) store.delete(key)
  })
}, 5 * 60 * 1000)

export function rateLimit(config: RateLimitConfig = { max: 100, windowMs: 60000 }) {
  return function checkRateLimit(req: NextRequest): NextResponse | null {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') ||
      'unknown'

    const key = `${ip}:${req.nextUrl.pathname}`
    const now = Date.now()
    const entry = store.get(key)

    if (!entry || entry.resetTime < now) {
      store.set(key, { count: 1, resetTime: now + config.windowMs })
      return null
    }

    entry.count++

    if (entry.count > config.max) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(config.max),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetTime / 1000)),
            'Retry-After': String(Math.ceil((entry.resetTime - now) / 1000)),
          },
        }
      )
    }

    return null
  }
}

export const apiRateLimit = rateLimit({
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  windowMs: Number(process.env.RATE_LIMIT_WINDOW) || 60000,
})

export const authRateLimit = rateLimit({ max: 10, windowMs: 60000 })
export const paymentRateLimit = rateLimit({ max: 20, windowMs: 60000 })
