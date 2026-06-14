'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Heart, Search, Menu, X, User, LogOut, Settings, Package } from 'lucide-react'
import { useCartStore } from '@/store/cart-store'
import { useUIStore } from '@/store/ui-store'
import { useWishlistStore } from '@/store/wishlist-store'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { User as UserType } from '@/types'
import { cn } from '@/lib/utils'
import Image from 'next/image'

const STATIC_LINKS = [
  {
    href: '/products',
    label: 'All Products',
  },
  {
    href: '/custom-printing',
    label: 'Custom Printing',
  },
]

export function Navbar() {
  const router = useRouter()
  const cartCount = useCartStore((s) => s.getItemCount())
  const wishlistCount = useWishlistStore((s) => s.productIds.length)
  const { isCartOpen, toggleCart, isMobileMenuOpen, openMobileMenu, closeMobileMenu, isSearchOpen, toggleSearch } = useUIStore()
  const [user, setUser] = useState<UserType | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mounted, setMounted] = useState(false)
  const [categories, setCategories] =
  useState<any[]>([])
  const supabase = createClient()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        supabase.from('users').select('*').eq('id', authUser.id).single().then(({ data }) => {
          setUser(data)
        })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setUser(null)
      if (session?.user) {
        supabase.from('users').select('*').eq('id', session.user.id).single().then(({ data }) => {
          setUser(data)
        })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const fetchCategories =
      async () => {

        const { data, error } =
          await supabase
            .from('categories')
            .select(`
              id,
              name,
              slug,
              parent_id,
              sort_order
            `)
            .eq('is_active', true)
            .order('sort_order', {
              ascending: true,
            })

        if (error) {
          console.error(error)
          return
        }

        setCategories(data || [])
      }

    fetchCategories()

  }, [])

  const NAV_LINKS = [
    ...STATIC_LINKS.slice(0, 1),
    ...categories.map((category) => ({
      href:
        `/products?category=${category.slug}`,
      label:
        category.name,
    })),
    STATIC_LINKS[1],
  ];

  const parentCategories =
    categories.filter(
      (cat) => !cat.parent_id
    )

  const getSubCategories = (
    parentId: string
  ) => {
    return categories.filter(
      (cat) =>
        cat.parent_id === parentId
    )
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.push('/')
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`)
      toggleSearch()
      setSearchQuery('')
    }
  }
  const LOGO_IMAGE = [
  '/images/logo.png',
  ]

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              {/* <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">TM</span>
              </div>
              <span className="font-bold text-xl text-gray-900 hidden sm:block">Lfour37</span> */}
              <Image
                src={LOGO_IMAGE[0]}
                alt={"Lfour37"}
                height={60}
                width={60}
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">

              {/* ALL PRODUCTS */}
              <Link
                href="/products"
                className="text-sm font-medium text-gray-600 hover:text-purple-600 transition-colors"
              >
                All Products
              </Link>

              {/* DYNAMIC CATEGORIES */}
              {parentCategories.map(
                (category) => {

                  const subCategories =
                    getSubCategories(
                      category.id
                    )

                  return (

                    <div
                      key={category.id}
                      className="relative group"
                    >

                      {/* PARENT */}
                      <Link
                        href={`/products?category=${category.slug}`}
                        className="text-sm font-medium text-gray-600 hover:text-purple-600 transition-colors"
                      >
                        {category.name}
                      </Link>

                      {/* DROPDOWN */}
                      {subCategories.length >
                        0 && (
                        <div
                          className="
                            absolute
                            left-0
                            top-full
                            pt-4
                            opacity-0
                            invisible
                            group-hover:opacity-100
                            group-hover:visible
                            transition-all
                            duration-200
                            z-50
                          "
                        >

                          <div
                            className="
                              min-w-[220px]
                              rounded-2xl
                              bg-white
                              shadow-xl
                              p-3
                            "
                          >

                            <div className="space-y-1">

                              {subCategories.map(
                                (sub) => (

                                  <Link
                                    key={sub.id}
                                    href={`/products?category=${sub.slug}`}
                                    className="
                                      block
                                      px-3
                                      py-2
                                      rounded-lg
                                      text-sm
                                      text-gray-700
                                      hover:bg-purple-600
                                      hover:text-white
                                      transition-colors
                                    "
                                  >
                                    {sub.name}
                                  </Link>
                                )
                              )}

                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
              )}

              {/* CUSTOM PRINTING */}
              <Link
                href="/custom-printing"
                className="text-sm font-medium text-gray-600 hover:text-purple-600 transition-colors"
              >
                Custom Printing
              </Link>

            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Search */}
              <button
                onClick={toggleSearch}
                className="p-2 text-gray-600 hover:text-purple-600 transition-colors"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Wishlist */}
              <Link href="/wishlist" className="relative p-2 text-gray-600 hover:text-purple-600 transition-colors">
                <Heart className="h-5 w-5" />
                {mounted && wishlistCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {wishlistCount > 9 ? '9+' : wishlistCount}
                  </span>
                )}
              </Link>

              {/* Cart */}
              <button
                onClick={toggleCart}
                className="relative p-2 text-gray-600 hover:text-purple-600 transition-colors"
                aria-label="Cart"
              >
                <ShoppingBag className="h-5 w-5" />
                {mounted && cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </button>

              {/* User menu */}
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {user.avatar_url ? (
                      <Image src={user.avatar_url} alt={user.full_name || ''} width={32} height={32} className="rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <span className="text-purple-600 text-xs font-bold">
                          {user.full_name?.charAt(0) || user.email.charAt(0)}
                        </span>
                      </div>
                    )}
                  </button>
                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                        <div className="px-4 py-2 border-b border-gray-100">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                        <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setUserMenuOpen(false)}>
                          <Package className="h-4 w-4" /> My Orders
                        </Link>
                        <Link href="/wishlist" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setUserMenuOpen(false)}>
                          <Heart className="h-4 w-4" /> Wishlist
                        </Link>
                        <Link href="/dashboard/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setUserMenuOpen(false)}>
                          <Settings className="h-4 w-4" /> Settings
                        </Link>
                        {(user.role === 'admin' || user.role === 'super_admin') && (
                          <Link href="/admin" className="flex items-center gap-2 px-4 py-2 text-sm text-purple-600 hover:bg-purple-50" onClick={() => setUserMenuOpen(false)}>
                            <Settings className="h-4 w-4" /> Admin Panel
                          </Link>
                        )}
                        <hr className="my-1 border-gray-100" />
                        <button
                          onClick={handleSignOut}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <Link href="/login">
                    <Button variant="ghost" size="sm">Sign In</Button>
                  </Link>
                  <Link href="/register">
                    <Button size="sm">Sign Up</Button>
                  </Link>
                </div>
              )}

              {/* Mobile menu */}
              <button
                onClick={openMobileMenu}
                className="md:hidden p-2 text-gray-600"
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        {isSearchOpen && (
          <div className="border-t border-gray-100 bg-white px-4 py-3">
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  autoFocus
                  type="search"
                  placeholder="Search for clothing, brands..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <Button type="submit" size="sm">Search</Button>
              <button type="button" onClick={toggleSearch} className="p-2 text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={closeMobileMenu} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-bold text-lg">Menu</span>
              <button onClick={closeMobileMenu}><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {/* ALL PRODUCTS */}
              <Link
                href="/products"
                className="
                  block
                  px-3
                  py-2.5
                  rounded-lg
                  text-gray-700
                  hover:bg-purple-50
                  hover:text-purple-600
                "
                onClick={closeMobileMenu}
              >
                All Products
              </Link>

              {/* CATEGORIES */}
              {parentCategories.map(
                (category) => {

                  const subCategories =
                    getSubCategories(
                      category.id
                    )

                  return (

                    <div
                      key={category.id}
                      className="space-y-1"
                    >

                      {/* PARENT */}
                      <Link
                        href={`/products?category=${category.slug}`}
                        className="
                          block
                          px-3
                          py-2.5
                          rounded-lg
                          font-medium
                          text-gray-800
                          hover:bg-purple-600
                          hover:text-white
                        "
                        onClick={closeMobileMenu}
                      >
                        {category.name}
                      </Link>

                      {/* CHILDREN */}
                      {subCategories.length >
                        0 && (

                        <div className="ml-4 border-l pl-3 space-y-1">

                          {subCategories.map(
                            (sub) => (

                              <Link
                                key={sub.id}
                                href={`/products?category=${sub.slug}`}
                                className="
                                  block
                                  py-1.5
                                  text-sm
                                  text-gray-500
                                  hover:text-purple-600
                                "
                                onClick={
                                  closeMobileMenu
                                }
                              >
                                {sub.name}
                              </Link>
                            )
                          )}

                        </div>
                      )}
                    </div>
                  )
                }
              )}

              {/* CUSTOM PRINTING */}
              <Link
                href="/custom-printing"
                className="
                  block
                  px-3
                  py-2.5
                  rounded-lg
                  text-gray-700
                  hover:bg-purple-50
                  hover:text-purple-600
                "
                onClick={closeMobileMenu}
              >
                Custom Printing
              </Link>
            </nav>
            {!user && (
              <div className="p-4 border-t space-y-2">
                <Link href="/login" className="block w-full" onClick={closeMobileMenu}>
                  <Button variant="outline" className="w-full">Sign In</Button>
                </Link>
                <Link href="/register" className="block w-full" onClick={closeMobileMenu}>
                  <Button className="w-full">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
