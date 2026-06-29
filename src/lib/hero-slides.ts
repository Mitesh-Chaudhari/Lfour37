import { createClient } from '@/lib/supabase/server'

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
  accent: string
  is_active: boolean
  sort_order: number
}

export async function getActiveHeroSlides(): Promise<HeroSlide[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('hero_slides')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    console.error('Failed to load hero slides:', error.message)
    return []
  }

  return (data as HeroSlide[]) || []
}

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
