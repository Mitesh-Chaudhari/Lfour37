import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/admin-auth'
import logger from '@/lib/logger'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdminUser()
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('upload')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type: ${file.type}` }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `cms/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
    const arrayBuffer = await file.arrayBuffer()

    const supabase = createAdminClient()
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        cacheControl: '31536000',
        upsert: false,
      })

    if (error) {
      logger.error('CKEditor image upload failed', { error, fileName })
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('product-images').getPublicUrl(data.path)

    // CKEditor SimpleUploadAdapter / custom adapter expects { url }
    return NextResponse.json({ url: publicUrl })
  } catch (error) {
    logger.error('CKEditor upload route failed', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
