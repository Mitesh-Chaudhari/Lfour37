import { OptimizedImage } from '@/components/ui/optimized-image'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const LOGO_IMAGE = [
    '/images/logo.png',
  ]
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-purple-50 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <Link href="/" className="flex items-center gap-2 w-fit">
          {/* <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">TM</span>
          </div>
          <span className="font-bold text-xl text-gray-900">Lfour37</span> */}
          <OptimizedImage
            src={LOGO_IMAGE[0]}
            alt="Lfour37"
            width={60}
            height={60}
            variant="logo"
            priority
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </Link>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        {children}
      </div>
    </div>
  )
}
