'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Slide {
  id: string
  badge: string
  title: string
  subtitle: string
  cta_text: string
  cta_link: string
  secondary_text: string
  secondary_link: string
  highlight_index: number
  image_url: string
  accent: string
}

export function HeroBanner() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)

    fetch('/api/hero-slides')
      .then(res => res.json())
      .then((data) => {
        setSlides(data)
      })
      .catch(() => console.error('Failed to load hero slides'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (slides.length === 0) return

    const id = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setCurrent((c) => (c + 1) % slides.length)
        setFading(false)
      }, 350)
    }, 5500)

    return () => clearInterval(id)
  }, [slides])

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

  const words = slide.title.split(' ');
  const hasImage = slide.image_url && slide.image_url.trim() !== '';

  return (
    <section
      className={`relative overflow-hidden text-white min-h-[90vh] flex flex-col justify-center bg-cover bg-center ${!hasImage ? 'bg-gray-950' : ''
        }`}
      style={
        hasImage
          ? { backgroundImage: `url(${slide.image_url})` }
          : undefined
      }
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:72px_72px]" />

      {/* Gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${slide.accent} opacity-[0.15]`} />

      <div className="relative container mx-auto px-4 py-28 lg:py-36">
        <div className="max-w-5xl mx-auto text-center">

          {/* Badge */}
          <div className={`transition-all duration-300 ${fading ? 'opacity-0 -translate-y-3' : 'opacity-100'}`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-5 py-2 text-sm text-white/70 mb-8">
              {slide.badge}
            </div>
          </div>

          {/* Title */}
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
              {/* <span className="block">{slide.title}</span> */}
            </h1>
          </div>

          {/* Subtitle */}
          <div className={`transition-all duration-300 ${fading ? 'opacity-0 translate-y-5' : 'opacity-100'}`}>
            <p className="text-lg sm:text-xl text-white/70 mb-12 max-w-2xl mx-auto">
              {slide.subtitle}
            </p>
          </div>

          {/* Buttons */}
          <div className={`flex flex-col sm:flex-row justify-center gap-4 transition-all duration-300 ${fading ? 'opacity-0 translate-y-5' : 'opacity-100'}`}>
            <Button
              size="lg"
              asChild
              className={`bg-gradient-to-r ${slide.accent} border-0 text-white px-8 rounded-full`}
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
                className="border-white/20 text-white bg-white/10 rounded-full"
              >
                <Link href={slide.secondary_link}>
                  {slide.secondary_text}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Dots */}
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