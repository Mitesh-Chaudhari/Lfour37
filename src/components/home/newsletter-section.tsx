'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Gift, Percent, Bell } from 'lucide-react'
import toast from 'react-hot-toast'

const PERKS = [
  { icon: Gift, text: 'Exclusive deals' },
  { icon: Percent, text: 'Early access to sales' },
  { icon: Bell, text: 'New arrivals first' },
]

export function NewsletterSection() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        toast.success("You're subscribed! Check your inbox.")
        setEmail('')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Something went wrong')
      }
    } catch {
      toast.error('Failed to subscribe. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="py-6 px-4">
      <div className="container mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-gray-950 text-white">
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:48px_48px]" />

          {/* Orbs */}
          <div className="absolute top-0 left-1/4 h-80 w-80 rounded-full bg-[#c39c41]/20 blur-[100px]" />
          <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-white/10 blur-[100px]" />

          <div className="relative px-6 py-16 sm:px-16 sm:py-20">
            <div className="max-w-2xl mx-auto text-center">
              {/* Icon */}
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 mb-6 mx-auto shadow-2xl shadow-purple-500/30">
                <Mail className="h-8 w-8 text-white" />
              </div>

              {/* <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-xs font-semibold text-purple-300 mb-5">
                JOIN 50,000+ SUBSCRIBERS
              </div> */}

              <h2 className="text-4xl sm:text-5xl font-black mb-4">
                Get Exclusive{' '}
                <span className="text-transparent bg-clip-text text-purple-600">
                  Deals & Drops
                </span>
              </h2>
              <p className="text-white/50 text-lg mb-8">
                Be the first to know about new arrivals, flash sales, and style tips.
              </p>

              {/* Perks */}
              <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
                {PERKS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-sm text-white/60">
                    <Icon className="h-4 w-4 text-purple-400" />
                    {text}
                  </div>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex gap-2 max-w-md mx-auto">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-white/8 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500 h-12 rounded-full px-5"
                  />
                </div>
                <Button
                  type="submit"
                  loading={loading}
                  disabled={loading}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0 text-white rounded-full px-6 h-12 hover:scale-105 transition-transform duration-200 shadow-lg"
                >
                  Subscribe
                </Button>
              </form>

              <p className="text-xs text-white/25 mt-4">
                No spam ever. Unsubscribe at any time. We respect your privacy.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
