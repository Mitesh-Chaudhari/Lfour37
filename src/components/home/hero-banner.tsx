'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Star, TrendingUp } from 'lucide-react'
import { useState, useEffect } from 'react'

const SLIDES = [
  {
    badge: 'New Collection 2026',
    headline: ['Refine', 'Your Daily', 'Vibe'],
    highlightIndex: 1,
    sub: 'Discover premium clothing curated for every occasion. From casual to couture — all in one place.',
    cta: 'Shop Now',
    ctaHref: '/products',
    secondary: 'New Arrivals',
    secondaryHref: '/products?filter=new',
    accent: 'text-purple-600',
    orb1: 'bg-[#c39c41]/30', // Soft Gold glow
    orb2: 'bg-white/30',
  },
  {
    badge: 'Summer Sale — Up to 60% Off',
    headline: ['Luxury,', 'Style on', 'Sale'],
    highlightIndex: 1,
    sub: "Shop the season's hottest pieces at unbeatable prices. Limited stock — don't miss out.",
    cta: 'Shop the Sale',
    ctaHref: '/products?filter=sale',
    secondary: 'New Arrivals',
    secondaryHref: '/products?filter=new',
    accent: 'text-purple-600',
    orb1: 'bg-white/30',     // Brighter White glow
    orb2: 'bg-[#c39c41]/30',
  },
  {
    badge: 'Trending This Week',
    headline: ['Top Picks', 'People', 'Love'],
    highlightIndex: 1,
    sub: 'Stay ahead of trends with our curated picks loved by thousands of fashion-forward shoppers.',
    cta: 'Shop Trending',
    ctaHref: '/products?filter=trending',
    secondary: 'All Products',
    secondaryHref: '/products',
    accent: 'text-purple-600',
    orb1: 'bg-[#c39c41]/30', // Stronger Gold
    orb2: 'bg-[#c39c41]/30',
  },
]

const STATS = [
  { value: '10K+', label: 'Products', icon: Sparkles },
  { value: '50K+', label: 'Happy Customers', icon: Star },
  { value: '100+', label: 'Top Brands', icon: TrendingUp },
]

export function HeroBanner() {
  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)

  const goTo = (index: number) => {
    if (index === current) return
    setFading(true)
    setTimeout(() => { setCurrent(index); setFading(false) }, 350)
  }

  useEffect(() => {
    const id = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setCurrent((c) => { const n = (c + 1) % SLIDES.length; return n })
        setFading(false)
      }, 350)
    }, 5500)
    return () => clearInterval(id)
  }, [])

  const slide = SLIDES[current]

  return (
    <section className="relative overflow-hidden bg-gray-950 text-white min-h-[90vh] flex flex-col justify-center">
      {/* Grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:72px_72px]" />

      {/* Dynamic gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${slide.accent} opacity-[0.15] transition-all duration-1000`} />

      {/* Orbs */}
      <div className={`absolute -top-20 -left-20 h-[600px] w-[600px] rounded-full ${slide.orb1} blur-[140px] transition-all duration-1000`} />
      <div className={`absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full ${slide.orb2} blur-[120px] transition-all duration-1000`} />

      <div className="relative container mx-auto px-4 py-28 lg:py-36">
        <div className="max-w-5xl mx-auto text-center">

          {/* Badge */}
          <div className={`transition-all duration-300 ${fading ? 'opacity-0 -translate-y-3' : 'opacity-100 translate-y-0'}`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-5 py-2 text-sm text-white/70 mb-8">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-gradient-to-r ${slide.accent}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 bg-gradient-to-r ${slide.accent}`} />
              </span>
              {slide.badge}
            </div>
          </div>

          {/* Headline */}
          <div className={`transition-all duration-300 ${fading ? 'opacity-0 translate-y-5' : 'opacity-100 translate-y-0'}`}>
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black leading-[0.88] tracking-tight mb-8">
              {slide.headline.map((word, i) =>
                i === slide.highlightIndex ? (
                  <span key={i} className={`block text-transparent bg-clip-text bg-gradient-to-r ${slide.accent}`}>
                    {word}
                  </span>
                ) : (
                  <span key={i} className="block">{word}</span>
                )
              )}
            </h1>
          </div>

          {/* Sub */}
          <div className={`transition-all duration-300 ${fading ? 'opacity-0 translate-y-5' : 'opacity-100 translate-y-0'}`}>
            <p className="text-lg sm:text-xl text-white/50 mb-12 max-w-2xl mx-auto leading-relaxed">
              {slide.sub}
            </p>
          </div>

          {/* CTAs */}
          <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 transition-all duration-300 ${fading ? 'opacity-0 translate-y-5' : 'opacity-100 translate-y-0'}`}>
            <Button
              size="xl"
              asChild
              className={`bg-gradient-to-r ${slide.accent} border-0 text-white shadow-2xl hover:scale-105 transition-transform duration-200 px-10 rounded-full`}
            >
              <Link href={slide.ctaHref} className="flex items-center gap-2">
                {slide.cta} <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="xl"
              asChild
              className="border-white/15 text-white/80 bg-white/5 hover:bg-white/10 backdrop-blur-sm rounded-full"
            >
              <Link href={slide.secondaryHref}>{slide.secondary}</Link>
            </Button>
          </div>

          {/* Stats */}
          {/* <div className="grid grid-cols-3 gap-8 max-w-md mx-auto">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div key={label} className="text-center">
                <Icon className="h-5 w-5 text-white/20 mx-auto mb-1" />
                <p className="text-3xl font-black text-white">{value}</p>
                <p className="text-xs text-white/35 mt-0.5">{label}</p>
              </div>
            ))}
          </div> */}
        </div>
      </div>

      {/* Slide dots */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`transition-all duration-300 rounded-full ${i === current ? 'w-7 h-2 bg-white' : 'w-2 h-2 bg-white/25 hover:bg-white/50'}`}
          />
        ))}
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </section>
  )
}
