import { unstable_cache } from 'next/cache'
import { createClient, createPublicClient } from '@/lib/supabase/server'
import { withTimeout } from '@/lib/fetch-with-timeout'

export interface HeroSlide {
  id: string
  badge: string
  title: string
  subtitle: string
  cta_text: string
  cta_link: string
  secondary_text: string | null
  secondary_link: string | null
  highlight_index: number
  image_url: string | null
  mobile_image_url: string | null
  video_url: string | null
  mobile_video_url: string | null
  accent: string
  is_active: boolean
  sort_order: number
}

async function fetchActiveHeroSlides(): Promise<HeroSlide[]> {
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('hero_slides')
    .select(
      'id, badge, title, subtitle, cta_text, cta_link, secondary_text, secondary_link, highlight_index, image_url, mobile_image_url, video_url, mobile_video_url, accent, is_active, sort_order'
    )
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    console.error('Failed to load hero slides:', error.message)
    return []
  }

  return (data as HeroSlide[]) || []
}

export const getActiveHeroSlides = unstable_cache(
  async () => withTimeout(fetchActiveHeroSlides(), []),
  ['active-hero-slides'],
  { revalidate: 120 }
)

export async function getAllHeroSlides(): Promise<HeroSlide[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('hero_slides')
    .select('*')
    .order('sort_order')

  if (error) {
    console.error('Failed to load hero slides:', error.message)
    return []
  }

  return (data as HeroSlide[]) || []
}
