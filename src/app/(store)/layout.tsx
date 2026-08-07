import { Suspense } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { CartDrawer } from '@/components/cart/cart-drawer'
import { ScrollToTop } from '@/components/layout/scroll-to-top'
import { MetaPixel } from '@/components/meta-pixel/meta-pixel'
import { GoogleAnalytics } from '@/components/google-analytics/google-analytics'
import { StoreAnalyticsTracker } from '@/components/analytics/store-analytics-tracker'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <GoogleAnalytics />
        <MetaPixel />
        <StoreAnalyticsTracker />
      </Suspense>
      <ScrollToTop />
      <Navbar />
      <CartDrawer />
      <main className="min-h-screen">{children}</main>
      <Footer />
    </>
  )
}
