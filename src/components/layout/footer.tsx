import Link from 'next/link'
import { Facebook, Instagram, Twitter, Youtube } from 'lucide-react'
import { OptimizedImage } from '@/components/ui/optimized-image'

const FOOTER_LINKS = {
  Shop: [
    { label: 'Men', href: '/products?category=men' },
    { label: 'Women', href: '/products?category=women' },
    // { label: 'Kids', href: '/products?category=kids' },
    { label: 'New Arrivals', href: '/products?filter=new' },
    { label: 'Sale', href: '/products?filter=sale' },
  ],
  Help: [
    { label: 'FAQ', href: '/faq' },
    { label: 'Size Guide', href: '/size-guide' },
    // { label: 'Shipping & Returns', href: '/shipping' },
    // { label: 'Contact Us', href: '/contact' },
    // { label: 'Track Order', href: '/dashboard/orders' },
    { label: 'Store Near Me', href: '/store-near-me' },
  ],
  Company: [
    { label: 'About Us', href: '/about' },
    { label: 'Careers', href: '/careers' },
    { label: 'Blog', href: '/blogs' },
    { label: 'Sitemap', href: '/site-map' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Returns & Refunds', href: '/return-refund' },
    { label: 'Terms of Service', href: '/terms' },
  ],
}

const PAYMENT_METHODS = ['Visa', 'Mastercard', 'UPI']
const LOGO_IMAGE = ['/images/logo.png']

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-10">
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <OptimizedImage
                src={LOGO_IMAGE[0]}
                alt="Lfour37"
                width={100}
                height={100}
                variant="logo"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </Link>
            <p className="text-sm text-gray-400 mb-4">
              Premium clothing for everyone. Discover curated styles with fast shipping and easy returns.
            </p>
            <div className="flex gap-3">
              {[
                { Icon: Instagram, href: '#', label: 'Instagram' },
                { Icon: Facebook, href: '#', label: 'Facebook' },
                { Icon: Twitter, href: '#', label: 'Twitter' },
                { Icon: Youtube, href: '#', label: 'YouTube' },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="p-2 rounded-lg bg-gray-800 hover:bg-purple-600 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-gray-400 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Yadevi Lifestyle Private Limited. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">We accept:</span>
            {PAYMENT_METHODS.map((method) => (
              <span
                key={method}
                className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-300 font-medium"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
