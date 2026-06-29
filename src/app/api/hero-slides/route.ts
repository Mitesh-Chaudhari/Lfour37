import { NextResponse } from 'next/server'
import { getActiveHeroSlides } from '@/lib/hero-slides'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const slides = await getActiveHeroSlides()

    return NextResponse.json(slides, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('GET /api/hero-slides failed:', error)
    return NextResponse.json([], { status: 200 })
  }
}
