'use client'

import Link from 'next/link'
import {
  LayoutDashboard,
  ScanBarcode,
  ShoppingBag,
  Package,
  ClipboardList,
  PackagePlus,
  FileSpreadsheet,
  Store,
  Building2,
  Users,
  Tag,
  BarChart2,
  type LucideIcon,
} from 'lucide-react'
import { appsForRole, STAFF_ROLE_LABELS, type StaffRole } from '@/lib/admin-permissions'

const ICONS: Record<string, LucideIcon> = {
  dashboards: LayoutDashboard,
  pos: ScanBarcode,
  orders: ShoppingBag,
  products: Package,
  purchase: ClipboardList,
  inventory: PackagePlus,
  gst: FileSpreadsheet,
  channel: Store,
  organization: Building2,
  users: Users,
  promotions: Tag,
  analytics: BarChart2,
}

export function AppsLauncherClient({
  role,
  userName,
}: {
  role: string
  userName: string
}) {
  const apps = appsForRole(role)
  const roleLabel =
    role in STAFF_ROLE_LABELS
      ? STAFF_ROLE_LABELS[role as StaffRole]
      : role

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4">
      <div className="text-center sm:text-left">
        <p className="text-sm text-gray-500">Yadevi Lifestyle</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Welcome{userName ? `, ${userName.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Signed in as <span className="font-medium text-gray-800">{roleLabel}</span>
          . Open an app to continue.
        </p>
      </div>

      {apps.length === 0 ? (
        <p className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
          No apps assigned to your role. Contact a Super Admin.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {apps.map((app) => {
            const Icon = ICONS[app.id] || LayoutDashboard
            return (
              <Link
                key={app.id}
                href={app.href}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm ${app.color}`}
                >
                  <Icon className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold text-gray-900 group-hover:text-gray-950">
                    {app.name}
                  </span>
                  <span className="block text-xs text-gray-500 leading-snug">
                    {app.description}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
