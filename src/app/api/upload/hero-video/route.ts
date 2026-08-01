import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

// Serverless request bodies are limited (~4.5MB on Vercel), so videos are
// uploaded straight from the browser to Supabase storage via a signed URL.
// This endpoint only authorizes the upload and hands back the signed token.
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB

export async function POST(request: NextRequest) {
  try {
    const userClient = await createClient()
    const {
      data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userData } = await userClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { fileType, fileSize } = await request.json()

    const ext = ALLOWED_VIDEO_TYPES[fileType]
    if (!ext) {
      return NextResponse.json(
        { error: 'Only MP4, WebM, or MOV videos are allowed' },
        { status: 400 }
      )
    }

    if (!fileSize || fileSize > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: 'Video must be under 100 MB' },
        { status: 400 }
      )
    }

    const path = `hero-videos/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin.storage
      .from('product-images')
      .createSignedUploadUrl(path)

    if (error || !data) {
      logger.error('Failed to create signed upload URL', { error, path })
      return NextResponse.json(
        { error: 'Failed to prepare video upload' },
        { status: 500 }
      )
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from('product-images').getPublicUrl(path)

    return NextResponse.json({
      token: data.token,
      path: data.path,
      publicUrl,
    })
  } catch (error) {
    logger.error('Hero video upload authorization error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
