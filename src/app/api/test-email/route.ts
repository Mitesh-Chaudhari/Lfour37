import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEmailConfigStatus, sendTestEmail } from '@/lib/email'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.TEST_EMAIL_SECRET
  if (secret) {
    const authorization = request.headers.get('authorization')
    if (authorization === `Bearer ${secret}`) {
      return true
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return false
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  return Boolean(
    profile && ['admin', 'super_admin'].includes(profile.role)
  )
}

function resolveRecipient(
  request: NextRequest,
  overrideTo?: string
): string {
  const queryTo = request.nextUrl.searchParams.get('to')
  const to = (overrideTo || queryTo || getEmailConfigStatus().defaultRecipient).trim()
  return to
}

async function handleTestEmail(
  request: NextRequest,
  options?: { to?: string; forceSend?: boolean }
) {
  const authorized = await isAuthorized(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = getEmailConfigStatus()
  const send =
    options?.forceSend ||
    request.nextUrl.searchParams.get('send') === '1'
  const to = resolveRecipient(request, options?.to)

  if (!send) {
    return NextResponse.json({
      message:
        'Email config status. Add ?send=1 to send a test, or POST with { "to": "you@example.com" }.',
      config,
      wouldSendTo: to,
    })
  }

  if (!config.configured) {
    return NextResponse.json(
      {
        error: 'SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.',
        config,
      },
      { status: 500 }
    )
  }

  try {
    await sendTestEmail(to)
    return NextResponse.json({
      success: true,
      to,
      from: config.from,
      message: 'Test email sent. Check server logs and the recipient inbox.',
    })
  } catch (error) {
    logger.error('Test email route failed', { error, to })
    return NextResponse.json(
      {
        success: false,
        to,
        from: config.from,
        error: error instanceof Error ? error.message : 'Send failed',
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleTestEmail(request)
}

export async function POST(request: NextRequest) {
  let to: string | undefined

  try {
    const body = await request.json()
    if (typeof body?.to === 'string') {
      to = body.to
    }
  } catch {
    // Empty body is fine; default recipient will be used.
  }

  return handleTestEmail(request, { to, forceSend: true })
}
