import { Truck, RotateCcw, Shield, Headphones, Zap, Award } from 'lucide-react'

const BADGES = [
  {
    icon: Truck,
    title: 'Free Shipping',
    description: 'Enjoy free shipping',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  {
    icon: RotateCcw,
    title: 'Easy Returns',
    description: '30-day return policy',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
  {
    icon: Shield,
    title: 'Secure Payment',
    description: 'Card accepted',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
  },
  {
    icon: Zap,
    title: 'Fast Delivery',
    description: '2–5 business days',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
  {
    icon: Award,
    title: 'Premium Quality',
    description: 'Curated collections only',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-100',
  },
  {
    icon: Headphones,
    title: '24/7 Support',
    description: 'Here to help anytime',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    border: 'border-cyan-100',
  },
]

export function TrustBadges() {
  return (
    <section className="py-14 bg-white border-b border-gray-100">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {BADGES.map(({ icon: Icon, title, description, color, bg, border }) => (
            <div
              key={title}
              className={`group flex flex-col items-center text-center gap-3 p-5 rounded-2xl border ${border} ${bg} hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
            >
              <div className={`h-12 w-12 rounded-xl ${bg} border ${border} flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                <Icon className={`h-6 w-6 ${color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
