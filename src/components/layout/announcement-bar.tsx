import { Sparkles } from 'lucide-react'
import { PREPAID_DISCOUNT_RATE } from '@/lib/prepaid-discount'

const DISCOUNT_PERCENT = `${PREPAID_DISCOUNT_RATE * 100}%`

export function AnnouncementBar() {
  return (
    <div className="bg-black">
      <p className="container mx-auto flex items-center justify-center gap-2 px-4 py-2 text-center text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-[#c39c41]">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Pay Online, Save More — Free Delivery + Extra {DISCOUNT_PERCENT} Off On All Prepaid
          Orders
        </span>
        <Sparkles className="h-3.5 w-3.5 shrink-0 hidden sm:block" aria-hidden />
      </p>
    </div>
  )
}
