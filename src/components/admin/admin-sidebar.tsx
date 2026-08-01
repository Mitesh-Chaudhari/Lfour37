'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Tag,
  BarChart2,
  Star,
  Layers,
  Ruler,
  Hash,
  LogOut,
  TicketSlash,
  SquareX,
  Newspaper,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface AdminSidebarProps {
  user: { full_name: string | null; email: string; role: string }
}

type NotificationKey = 'orders' | 'cancelRequests'

const NAV_ITEMS: Array<{
  href: string
  icon: React.ElementType
  label: string
  exact?: boolean
  notificationKey?: NotificationKey
}> = [
  { href: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { href: '/admin/products', icon: Package, label: 'Products' },
  { href: '/admin/categories', icon: Layers, label: 'Categories' },
  { href: '/admin/sizes', icon: Ruler, label: 'Product Sizes' },
  { href: '/admin/size-guides', icon: Ruler, label: 'Size Guides' },
  { href: '/admin/hsn-codes', icon: Hash, label: 'Manage HSN Code' },
  { href: '/admin/orders', icon: ShoppingBag, label: 'Orders', notificationKey: 'orders' },
  { href: '/admin/order-cancel-requests', icon: SquareX, label: 'Cancel Requests', notificationKey: 'cancelRequests' },
  { href: '/admin/cancel-reasons', icon: SquareX, label: 'Order Cancel Reasons Manage' },
  { href: '/admin/pages', icon: TicketSlash, label: 'Content Pages' },
  { href: '/admin/blogs', icon: Newspaper, label: 'Blog' },
  { href: '/admin/users', icon: Users, label: 'Users' },
  { href: '/admin/hero-slides', icon: TicketSlash, label: 'Banners' },
  { href: '/admin/promotions', icon: Tag, label: 'Promotions' },
  { href: '/admin/analytics', icon: BarChart2, label: 'Analytics' },
  { href: '/admin/reviews', icon: Star, label: 'Reviews' },
]

const SEEN_ORDERS_AT_KEY = 'admin_seen_orders_at'
const SEEN_CANCEL_IDS_KEY = 'admin_seen_cancel_request_ids'
const POLL_INTERVAL_MS = 60_000

function getSeenCancelIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_CANCEL_IDS_KEY) || '[]')
  } catch {
    return []
  }
}

export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Record<NotificationKey, boolean>>({
    orders: false,
    cancelRequests: false,
  })

  // Poll for new (unvisited) orders and cancel requests
  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        let ordersSince = localStorage.getItem(SEEN_ORDERS_AT_KEY)
        if (!ordersSince) {
          // First run: only orders from now on count as "new"
          ordersSince = new Date().toISOString()
          localStorage.setItem(SEEN_ORDERS_AT_KEY, ordersSince)
        }

        const res = await fetch(
          `/api/admin/notifications?orders_since=${encodeURIComponent(ordersSince)}`,
          { cache: 'no-store' }
        )
        if (!res.ok || cancelled) return

        const data = await res.json()
        const seenIds = getSeenCancelIds()
        const unseenCancelRequests = (data.cancel_request_ids || []).some(
          (id: string) => !seenIds.includes(id)
        )

        setNotifications({
          orders: (data.new_orders_count || 0) > 0,
          cancelRequests: unseenCancelRequests,
        })
      } catch {
        // Notification dots are best-effort; never break the sidebar
      }
    }

    check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [pathname])

  // Visiting a page marks its items as seen and clears the dot
  useEffect(() => {
    if (pathname.startsWith('/admin/orders')) {
      localStorage.setItem(SEEN_ORDERS_AT_KEY, new Date().toISOString())
      setNotifications((n) => ({ ...n, orders: false }))
    }

    if (pathname.startsWith('/admin/order-cancel-requests')) {
      fetch('/api/admin/notifications', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            localStorage.setItem(
              SEEN_CANCEL_IDS_KEY,
              JSON.stringify(data.cancel_request_ids || [])
            )
          }
        })
        .catch(() => {})
      setNotifications((n) => ({ ...n, cancelRequests: false }))
    }
  }, [pathname])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }
  const LOGO_IMAGE = [
    '/images/logo.png',
  ]
  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white flex flex-col z-30">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800">
        <Link href="/admin" className="flex items-center gap-2">
          {/* <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">TM</span>
          </div>
          <div>
            <p className="font-bold text-white text-sm">Lfour37</p>
            <p className="text-xs text-gray-400">Admin Panel</p>
          </div> */}
          <div>
            <OptimizedImage
              src={LOGO_IMAGE[0]}
              alt="Lfour37"
              width={60}
              height={60}
              variant="logo"
              priority
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <p className="text-xs text-gray-400">Admin Panel</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, label, exact, notificationKey }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href)
          const showDot =
            notificationKey && !isActive && notifications[notificationKey]
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
              {showDot && (
                <span
                  className="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse"
                  aria-label="New items"
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-xs font-bold">
              {(user.full_name || user.email).charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user.full_name || user.email}</p>
            <p className="text-xs text-gray-400 capitalize">{user.role.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </aside>
  )
}
