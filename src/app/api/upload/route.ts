import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import logger from '@/lib/logger'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createAdminClient()

    // Verify user is admin
    const { createClient } = await import('@/lib/supabase/server')
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()

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

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (files.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 files allowed' }, { status: 400 })
    }

    const uploadedUrls: string[] = []

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `Invalid file type: ${file.type}` }, { status: 400 })
      }

      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: `File too large: ${file.name}` }, { status: 400 })
      }

      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `products/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
      const arrayBuffer = await file.arrayBuffer()

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, arrayBuffer, {
          contentType: file.type,
          cacheControl: '31536000',
          upsert: false,
        })

      if (error) {
        logger.error('Upload failed', { error, fileName })
        return NextResponse.json({ error: `Failed to upload ${file.name}` }, { status: 500 })
      }

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(data.path)

      uploadedUrls.push(publicUrl)
    }

    return NextResponse.json({ urls: uploadedUrls })
  } catch (error) {
    logger.error('Upload error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
