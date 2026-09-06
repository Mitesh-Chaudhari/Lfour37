'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { ArrowRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { HeroSlide } from '@/lib/hero-slides'
import { useHeroSlides } from '@/hooks/use-hero-slides'

interface HeroBannerProps {
  initialSlides?: HeroSlide[]
}

export function HeroBanner({ initialSlides = [] }: HeroBannerProps) {
  const { data: slides = [], isLoading } = useHeroSlides({
    initialData: initialSlides,
    // Only hit the API when SSR didn't provide slides
    enabled: initialSlides.length === 0,
  })

  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)

  const loading = initialSlides.length === 0 && isLoading

  useEffect(() => {
    setCurrent(0)
  }, [slides])

  useEffect(() => {
    if (slides.length <= 1) return

    const activeSlide = slides[current]
    const hasVideo = Boolean(
      activeSlide?.video_url?.trim() || activeSlide?.mobile_video_url?.trim()
    )
    const delay = hasVideo ? 12000 : 5500

    const id = setTimeout(() => {
      setFading(true)
      setTimeout(() => {
        setCurrent((c) => (c + 1) % slides.length)
        setFading(false)
      }, 350)
    }, delay)

    return () => clearTimeout(id)
  }, [slides, current])

  const goTo = (index: number) => {
    if (index === current) return
    setFading(true)
    setTimeout(() => {
      setCurrent(index)
      setFading(false)
    }, 350)
  }

  const slide = slides[current]
  if (loading) {
    return (
      <section className="relative min-h-[90vh] bg-gray-950 flex items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="h-6 w-40 bg-gray-700 rounded mx-auto mb-6" />
          <div className="h-12 w-72 bg-gray-700 rounded mx-auto mb-4" />
          <div className="h-12 w-60 bg-gray-700 rounded mx-auto mb-8" />
          <div className="h-4 w-80 bg-gray-700 rounded mx-auto mb-6" />
          <div className="h-10 w-40 bg-gray-700 rounded-full mx-auto" />
        </div>
      </section>
    )
  }
  if (!slide) return null

  const words = slide.title.split(' ')
  const desktopImage = slide.image_url?.trim() || null
  const desktopVideo = slide.video_url?.trim() || null
  const mobileImage = slide.mobile_image_url?.trim() || desktopImage
  const mobileVideo =
    slide.mobile_video_url?.trim() ||
    (slide.mobile_image_url?.trim() ? null : desktopVideo)

  return (
    <section className="relative overflow-hidden text-white min-h-[90vh] flex flex-col justify-center bg-gray-950">
      {desktopVideo ? (
        <video
          key={`${slide.id}-desktop-video`}
          src={desktopVideo}
          poster={desktopImage || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className={cn(
            'hidden md:block absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            fading ? 'opacity-0' : 'opacity-100'
          )}
        />
      ) : desktopImage ? (
        <OptimizedImage
          key={`${slide.id}-desktop`}
          src={desktopImage}
          alt=""
          fill
          variant="hero"
          priority
          className={cn(
            'hidden md:block object-cover transition-opacity duration-500',
            fading ? 'opacity-0' : 'opacity-100'
          )}
        />
      ) : null}

      {mobileVideo ? (
        <video
          key={`${slide.id}-mobile-video`}
          src={mobileVideo}
          poster={mobileImage || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className={cn(
            'md:hidden absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            fading ? 'opacity-0' : 'opacity-100'
          )}
        />
      ) : mobileImage ? (
        <OptimizedImage
          key={`${slide.id}-mobile`}
          src={mobileImage}
          alt=""
          fill
          variant="heroMobile"
          priority
          className={cn(
            'md:hidden object-cover transition-opacity duration-500',
            fading ? 'opacity-0' : 'opacity-100'
          )}
        />
      ) : null}

      <div className="relative container mx-auto px-4 py-28 lg:py-36">
        <div className="max-w-5xl mx-auto text-center">
          <div className={`transition-all duration-300 ${fading ? 'opacity-0 -translate-y-3' : 'opacity-100'}`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-5 py-2 text-sm text-white/70 mb-8">
              {slide.badge}
            </div>
          </div>

          <div className={`transition-all duration-300 ${fading ? 'opacity-0 translate-y-5' : 'opacity-100'}`}>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-tight mb-8">
              {words.map((word, i) =>
                i === 2 ? (
                  <span key={i} className={`inline-block text-transparent bg-clip-text bg-gradient-to-r pr-2 ${slide.accent}`}>
                    {word}
                  </span>
                ) : (
                  <span key={i} className="inline-block pr-2">{word}</span>
                )
              )}
            </h1>
          </div>

          <div className={`transition-all duration-300 ${fading ? 'opacity-0 translate-y-5' : 'opacity-100'}`}>
            <p className="text-lg sm:text-xl text-white/70 mb-12 max-w-2xl mx-auto">
              {slide.subtitle}
            </p>
          </div>

          <div className={`flex flex-col sm:flex-row justify-center gap-4 transition-all duration-300 ${fading ? 'opacity-0 translate-y-5' : 'opacity-100'}`}>
            <Button
              size="lg"
              asChild
              className="border-white/20 text-white bg-white/10 rounded-full hover:bg-white hover:text-purple-600 hover:border-transparent"
            >
              <Link href={slide.cta_link || '/products'}>
                {slide.cta_text} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            {slide.secondary_link && slide.secondary_text && (
              <Button
                variant="outline"
                size="lg"
                asChild
                className="border-white/20 text-white bg-white/10 rounded-full hover:bg-white hover:text-purple-600 hover:border-transparent"
              >
                <Link href={slide.secondary_link}>
                  {slide.secondary_text}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all ${i === current ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/30'
              }`}
          />
        ))}
      </div>
    </section>
  )
}
