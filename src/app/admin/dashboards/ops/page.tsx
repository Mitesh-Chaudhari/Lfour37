import { DashboardClient } from '@/components/admin/dashboard-client'

export default function AdminOpsDashboardPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Detailed ecommerce ops metrics (funnel, RTO, contribution). For
        Odoo-style Sales / POS / Finance tabs, go back to{' '}
        <a href="/admin/dashboards" className="font-medium text-violet-700 underline">
          Dashboards
        </a>
        .
      </p>
      <DashboardClient />
    </div>
  )
}
