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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface AdminSidebarProps {
  user: { full_name: string | null; email: string; role: string }
  mobileOpen?: boolean
  collapsed?: boolean
  onMobileClose?: () => void
  onToggleCollapse?: () => void
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
  {
    href: '/admin/orders',
    icon: ShoppingBag,
    label: 'Orders',
    notificationKey: 'orders',
  },
  {
    href: '/admin/order-cancel-requests',
    icon: SquareX,
    label: 'Cancel Requests',
    notificationKey: 'cancelRequests',
  },
  {
    href: '/admin/cancel-reasons',
    icon: SquareX,
    label: 'Order Cancel Reasons Manage',
  },
  {
    href: '/admin/return-reasons',
    icon: TicketSlash,
    label: 'Return Reasons',
  },
  {
    href: '/admin/exchange-reasons',
    icon: TicketSlash,
    label: 'Exchange Reasons',
  },
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

export function AdminSidebar({
  user,
  mobileOpen = false,
  collapsed = false,
  onMobileClose,
  onToggleCollapse,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [notifications, setNotifications] = useState<
    Record<NotificationKey, boolean>
  >({
    orders: false,
    cancelRequests: false,
  })

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        let ordersSince = localStorage.getItem(SEEN_ORDERS_AT_KEY)
        if (!ordersSince) {
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
        // best-effort
      }
    }

    check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [pathname])

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

    // Auto-close mobile drawer after navigation
    onMobileClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on route change
  }, [pathname])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const LOGO_IMAGE = ['/images/logo.png']
  const showLabels = !collapsed

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col bg-gray-900 text-white transition-transform duration-200 lg:z-30 lg:translate-x-0',
        collapsed ? 'lg:w-16' : 'lg:w-64',
        'w-72 max-w-[85vw]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div
        className={cn(
          'flex items-center border-b border-gray-800',
          collapsed ? 'justify-center p-3' : 'gap-2 p-4'
        )}
      >
        <Link
          href="/admin"
          className={cn(
            'flex min-w-0 items-center',
            collapsed ? 'justify-center' : 'gap-2'
          )}
          onClick={() => onMobileClose?.()}
          title="Admin Dashboard"
        >
          <OptimizedImage
            src={LOGO_IMAGE[0]}
            alt="Lfour37"
            width={collapsed ? 36 : 60}
            height={collapsed ? 36 : 60}
            variant="logo"
            priority
            className="object-cover"
          />
          {showLabels && (
            <div className="min-w-0 lg:block">
              <p className="text-xs text-gray-400">Admin Panel</p>
            </div>
          )}
        </Link>

        {onToggleCollapse && (
          <button
            type="button"
            className="ml-auto hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white lg:inline-flex"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2 sm:p-3">
        {NAV_ITEMS.map(
          ({ href, icon: Icon, label, exact, notificationKey }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href)
            const showDot =
              notificationKey && !isActive && notifications[notificationKey]
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  'relative flex items-center rounded-xl text-sm font-medium transition-colors',
                  collapsed
                    ? 'justify-center px-2 py-2.5'
                    : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {showLabels && (
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                )}
                {showDot && (
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse',
                      collapsed
                        ? 'absolute right-1.5 top-1.5'
                        : 'ml-auto'
                    )}
                    aria-label="New items"
                  />
                )}
              </Link>
            )
          }
        )}
      </nav>

      <div className={cn('border-t border-gray-800', collapsed ? 'p-2' : 'p-4')}>
        {!collapsed && (
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600">
              <span className="text-xs font-bold">
                {(user.full_name || user.email).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user.full_name || user.email}
              </p>
              <p className="truncate text-xs capitalize text-gray-400">
                {user.role.replace('_', ' ')}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={handleSignOut}
          title="Sign Out"
          className={cn(
            'flex w-full items-center rounded-xl text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-2 px-3 py-2'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {showLabels && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
