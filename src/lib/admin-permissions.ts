/**
 * Yadevi admin RBAC — roles, permissions, path guards.
 * Phase 1: UI + route + API gates. Super admin / admin keep full access.
 *
 * Store / ERP ops live in ERPNext now. Permissions listed in
 * ERPNEXT_REPLACED_PERMISSIONS are hidden from the website admin UI and
 * blocked on direct URL access.
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

/** Modules moved to ERPNext — hidden in this admin app. */
export const ERPNEXT_REPLACED_PERMISSIONS: Permission[] = [
  'pos',
  'purchase_orders',
  'inventory',
  'reports_channel',
  'reports_gst',
  'dashboards',
]

const ERPNEXT_REPLACED_SET = new Set<Permission>(ERPNEXT_REPLACED_PERMISSIONS)

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
  return ROLE_PERMISSIONS[role].filter((p) => !ERPNEXT_REPLACED_SET.has(p))
}

export function hasPermission(
  role: string | null | undefined,
  permission: Permission
): boolean {
  if (ERPNEXT_REPLACED_SET.has(permission)) return false
  return getPermissionsForRole(role).includes(permission)
}

/** True when a path belongs to an ERPNext-replaced module. */
export function isErpNextReplacedPath(pathname: string): boolean {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/admin'
  if (path === '/admin/dashboards' || path.startsWith('/admin/dashboards/')) {
    return true
  }
  if (path === '/admin/pos' || path.startsWith('/admin/pos/')) return true
  if (path.startsWith('/admin/procurement')) return true
  if (path.startsWith('/admin/reports/gst')) return true
  if (path.startsWith('/admin/reports/channel-sales')) return true
  // Stock ops moved to ERPNext; barcode page stays (website catalogue).
  if (path.startsWith('/admin/inventory/barcodes')) return false
  if (path.startsWith('/admin/inventory')) return true
  return false
}

export function hasAnyPermission(
  role: string | null | undefined,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

/** Map admin URL prefixes → required permission (longer prefixes first). */
const PATH_PERMISSIONS: Array<{ prefix: string; permission: Permission }> = [
  { prefix: '/admin/organization', permission: 'organization' },
  { prefix: '/admin/pos', permission: 'pos' },
  { prefix: '/admin/procurement', permission: 'purchase_orders' },
  // Barcodes kept for website catalogue; other inventory → ERPNext.
  { prefix: '/admin/inventory/barcodes', permission: 'products' },
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

  if (isErpNextReplacedPath(path)) return false

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
  if (hasPermission(role, 'orders')) return '/admin/orders'
  if (hasPermission(role, 'products')) return '/admin/products'
  if (hasPermission(role, 'analytics')) return '/admin/analytics'
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

/** App launcher entries for the website admin (ERP ops live in ERPNext). */
export const ADMIN_APPS: AdminApp[] = [
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
  return ADMIN_APPS.filter(
    (app) =>
      !ERPNEXT_REPLACED_SET.has(app.permission) &&
      hasPermission(role, app.permission)
  )
}
