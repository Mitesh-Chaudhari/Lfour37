import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-purple-600 text-white',
        secondary: 'border-transparent bg-gray-100 text-gray-800',
        destructive: 'border-transparent bg-red-600 text-white',
        outline: 'text-gray-700',
        success: 'border-transparent bg-green-100 text-green-800',
        warning: 'border-transparent bg-yellow-100 text-yellow-800',
        info: 'border-transparent bg-blue-100 text-blue-800',
        // new: 'border-transparent bg-green-500 text-white',
        // sale: 'border-transparent bg-red-500 text-white',
        // trending: 'border-transparent bg-orange-500 text-white',
        new: 'border-transparent bg-[#c39c41] text-black shadow-sm', // Solid Gold
        sale: 'border-[#c39c41] bg-black text-[#c39c41]',           // Black background, Gold text/border
        trending: 'border-transparent bg-[#c39c41]/10 text-[#c39c41] border border-[#c39c41]/20', // Subtle Gold tint
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
