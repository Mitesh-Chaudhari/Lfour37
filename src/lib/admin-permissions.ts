/**
 * Yadevi admin RBAC — roles, permissions, path guards.
 * Phase 1: UI + route + API gates. Super admin / admin keep full access.
 */

export const STAFF_ROLES = [
  'super_admin',
  'admin',
  'sales',
  'pos',
  'warehouse',
  'accountant',
] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

export type Permission =
  | 'apps'
  | 'dashboards'
  | 'organization'
  | 'pos'
  | 'purchase_orders'
  | 'inventory'
  | 'reports_channel'
  | 'reports_gst'
  | 'products'
  | 'catalog' // categories, sizes, hsn, size guides
  | 'orders'
  | 'returns'
  | 'users'
  | 'content' // pages, blogs, banners
  | 'promotions'
  | 'analytics'
  | 'reviews'

/** Human labels for Users screen */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  sales: 'Sales',
  pos: 'POS / Store',
  warehouse: 'Warehouse',
  accountant: 'Accountant',
}

const ALL: Permission[] = [
  'apps',
  'dashboards',
  'organization',
  'pos',
  'purchase_orders',
  'inventory',
  'reports_channel',
  'reports_gst',
  'products',
  'catalog',
  'orders',
  'returns',
  'users',
  'content',
  'promotions',
  'analytics',
  'reviews',
]

const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  super_admin: ALL,
  admin: ALL,
  sales: [
    'apps',
    'dashboards',
    'orders',
    'returns',
    'products', // read via pages; write still admin-gated in APIs later
    'analytics',
    'reviews',
  ],
  pos: ['apps', 'dashboards', 'pos', 'orders'],
  warehouse: [
    'apps',
    'dashboards',
    'purchase_orders',
    'inventory',
    'products',
    'catalog',
  ],
  accountant: [
    'apps',
    'dashboards',
    'reports_gst',
    'reports_channel',
    'orders',
    'analytics',
  ],
}

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role)
}

export function getPermissionsForRole(role: string | null | undefined): Permission[] {
  if (!isStaffRole(role)) return []
  return ROLE_PERMISSIONS[role]
}

export function hasPermission(
  role: string | null | undefined,
  permission: Permission
): boolean {
  return getPermissionsForRole(role).includes(permission)
}

export function hasAnyPermission(
  role: string | null | undefined,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

/** Map admin URL prefixes → required permission */
const PATH_PERMISSIONS: Array<{ prefix: string; permission: Permission }> = [
  { prefix: '/admin/organization', permission: 'organization' },
  { prefix: '/admin/pos', permission: 'pos' },
  { prefix: '/admin/procurement', permission: 'purchase_orders' },
  { prefix: '/admin/inventory', permission: 'inventory' },
  { prefix: '/admin/reports/channel-sales', permission: 'reports_channel' },
  { prefix: '/admin/reports/gst', permission: 'reports_gst' },
  { prefix: '/admin/products', permission: 'products' },
  { prefix: '/admin/categories', permission: 'catalog' },
  { prefix: '/admin/sizes', permission: 'catalog' },
  { prefix: '/admin/size-guides', permission: 'catalog' },
  { prefix: '/admin/hsn-codes', permission: 'catalog' },
  { prefix: '/admin/orders', permission: 'orders' },
  { prefix: '/admin/order-cancel-requests', permission: 'returns' },
  { prefix: '/admin/returns', permission: 'returns' },
  { prefix: '/admin/cancel-reasons', permission: 'returns' },
  { prefix: '/admin/return-reasons', permission: 'returns' },
  { prefix: '/admin/exchange-reasons', permission: 'returns' },
  { prefix: '/admin/users', permission: 'users' },
  { prefix: '/admin/pages', permission: 'content' },
  { prefix: '/admin/blogs', permission: 'content' },
  { prefix: '/admin/hero-slides', permission: 'content' },
  { prefix: '/admin/promotions', permission: 'promotions' },
  { prefix: '/admin/analytics', permission: 'analytics' },
  { prefix: '/admin/reviews', permission: 'reviews' },
  { prefix: '/admin/dashboards', permission: 'dashboards' },
]

/** Paths every staff member may open */
const OPEN_PATHS = ['/admin', '/admin/apps']

export function canAccessPath(
  role: string | null | undefined,
  pathname: string
): boolean {
  if (!isStaffRole(role)) return false

  const path = pathname.split('?')[0].replace(/\/$/, '') || '/admin'
  if (path === '/admin' || path === '/admin/apps') return true

  // Exact dashboards home
  if (path === '/admin/dashboards' || path.startsWith('/admin/dashboards/')) {
    return hasPermission(role, 'dashboards')
  }

  for (const { prefix, permission } of PATH_PERMISSIONS) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      return hasPermission(role, permission)
    }
  }

  // Unknown admin paths: only full admins
  return role === 'admin' || role === 'super_admin'
}

export function firstAllowedPath(role: string | null | undefined): string {
  if (hasPermission(role, 'apps')) return '/admin'
  if (hasPermission(role, 'dashboards')) return '/admin/dashboards'
  if (hasPermission(role, 'pos')) return '/admin/pos'
  if (hasPermission(role, 'orders')) return '/admin/orders'
  if (hasPermission(role, 'inventory')) return '/admin/inventory/receive'
  if (hasPermission(role, 'reports_gst')) return '/admin/reports/gst'
  return '/admin'
}

export type AdminApp = {
  id: string
  name: string
  description: string
  href: string
  permission: Permission
  color: string
}

/** Odoo-style app launcher entries (existing modules only in Phase 1) */
export const ADMIN_APPS: AdminApp[] = [
  {
    id: 'dashboards',
    name: 'Dashboards',
    description: 'Sales, POS & Finance KPIs',
    href: '/admin/dashboards',
    permission: 'dashboards',
    color: 'bg-violet-500',
  },
  {
    id: 'pos',
    name: 'Point of Sale',
    description: 'Barcode checkout at store',
    href: '/admin/pos',
    permission: 'pos',
    color: 'bg-amber-500',
  },
  {
    id: 'orders',
    name: 'Orders',
    description: 'Online orders & fulfilment',
    href: '/admin/orders',
    permission: 'orders',
    color: 'bg-sky-500',
  },
  {
    id: 'products',
    name: 'Products',
    description: 'Catalogue & variants',
    href: '/admin/products',
    permission: 'products',
    color: 'bg-emerald-500',
  },
  {
    id: 'purchase',
    name: 'Purchase',
    description: 'Purchase orders & suppliers',
    href: '/admin/procurement/purchase-orders',
    permission: 'purchase_orders',
    color: 'bg-teal-600',
  },
  {
    id: 'inventory',
    name: 'Inventory',
    description: 'Receive, transfer, movements',
    href: '/admin/inventory/receive',
    permission: 'inventory',
    color: 'bg-orange-500',
  },
  {
    id: 'gst',
    name: 'GST / Finance',
    description: 'GST working reports',
    href: '/admin/reports/gst',
    permission: 'reports_gst',
    color: 'bg-rose-500',
  },
  {
    id: 'channel',
    name: 'Online vs Store',
    description: 'Channel sales comparison',
    href: '/admin/reports/channel-sales',
    permission: 'reports_channel',
    color: 'bg-indigo-500',
  },
  {
    id: 'organization',
    name: 'Organization',
    description: 'Company, brands, locations',
    href: '/admin/organization',
    permission: 'organization',
    color: 'bg-slate-600',
  },
  {
    id: 'users',
    name: 'Users & Roles',
    description: 'Staff access control',
    href: '/admin/users',
    permission: 'users',
    color: 'bg-fuchsia-600',
  },
  {
    id: 'promotions',
    name: 'Promotions',
    description: 'Coupons & offers',
    href: '/admin/promotions',
    permission: 'promotions',
    color: 'bg-pink-500',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Traffic & performance',
    href: '/admin/analytics',
    permission: 'analytics',
    color: 'bg-cyan-600',
  },
]

export function appsForRole(role: string | null | undefined): AdminApp[] {
  return ADMIN_APPS.filter((app) => hasPermission(role, app.permission))
}
