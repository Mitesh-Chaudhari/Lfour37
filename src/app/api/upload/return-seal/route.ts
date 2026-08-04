import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
]
const MAX_SIZE = 8 * 1024 * 1024 // 8MB

export async function POST(request: NextRequest) {
  try {
    const userClient = await createClient()
    const {
      data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Upload a JPG, PNG, or WebP image' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Image must be under 8MB' },
        { status: 400 }
      )
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `returns/${user.id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}.${ext}`
    const arrayBuffer = await file.arrayBuffer()

    const supabase = await createAdminClient()
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        cacheControl: '31536000',
        upsert: false,
      })

    if (error) {
      logger.error('Return seal upload failed', { error, fileName, userId: user.id })
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('product-images').getPublicUrl(data.path)

    return NextResponse.json({ url: publicUrl })
  } catch (error) {
    logger.error('Return seal upload error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
