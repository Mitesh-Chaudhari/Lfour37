import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { Providers } from './providers'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Lfour37'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${APP_NAME} - Premium Clothing Marketplace`,
    template: `%s | ${APP_NAME}`,
  },
  description: 'Discover premium clothing for men, women, and kids. Shop the latest styles with fast shipping, easy returns, and crypto payment options.',
  keywords: ['clothing', 'fashion', 'men', 'women', 'kids', 'online shopping', 'marketplace'],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: APP_NAME,
    title: `${APP_NAME} - Premium Clothing Marketplace`,
    description: 'Discover premium clothing for everyone. Shop with confidence.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: APP_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} - Premium Clothing Marketplace`,
    description: 'Discover premium clothing for everyone.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: { borderRadius: '10px', background: '#333', color: '#fff', fontSize: '14px' },
              success: { iconTheme: { primary: '#c39c41', secondary: '#fff' } },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
