import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Tag, Clock } from 'lucide-react'

interface PromoBannerProps {
  title: string
  subtitle: string
  backgroundGradient?: string
  href: string
  ctaText?: string
}

export function PromoBanner({
  title,
  subtitle,
  backgroundGradient = '',
  href,
  ctaText = 'Shop Now',
}: PromoBannerProps) {
  return (
    <section className="py-6 px-4">
      <div className="container mx-auto">
        <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${backgroundGradient} text-white`}>
          {/* Background patterns */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />

          <div className="relative px-8 py-16 sm:px-16 sm:py-20">
            <div className="max-w-3xl mx-auto text-center">
              {/* Tags */}
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 text-xs font-semibold">
                  <Tag className="h-3 w-3" /> Limited Time
                </div>
                <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-4 py-1.5 text-xs font-semibold">
                  <Clock className="h-3 w-3" /> Ends Soon
                </div>
              </div>

              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-4 leading-tight">{title}</h2>
              <p className="text-xl sm:text-2xl text-white/75 mb-10 font-light">{subtitle}</p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="xl"
                  asChild
                  className="bg-white text-gray-900 hover:bg-white/90 shadow-2xl hover:scale-105 transition-all duration-200 rounded-full px-10 font-bold"
                >
                  <Link href={href} className="flex items-center gap-2">
                    {ctaText} <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
