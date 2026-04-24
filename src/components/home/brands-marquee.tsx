const BRANDS = [
  'Nike', 'Adidas', 'Zara', 'H&M', 'Gucci', 'Prada', 'Calvin Klein',
  'Tommy Hilfiger', 'Levi\'s', 'Ralph Lauren', 'Versace', 'Armani',
]

export function BrandsMarquee() {
  return (
    <section className="py-12 bg-gray-50 border-y border-gray-100 overflow-hidden">
      <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-8">
        Trusted brands from around the world
      </p>
      <div className="relative flex">
        {/* First set */}
        <div className="flex items-center gap-16 animate-[marquee_25s_linear_infinite] whitespace-nowrap">
          {BRANDS.map((brand) => (
            <span key={brand} className="text-2xl font-black text-gray-200 hover:text-gray-400 transition-colors cursor-default select-none">
              {brand}
            </span>
          ))}
        </div>
        {/* Duplicate for seamless loop */}
        <div className="flex items-center gap-16 animate-[marquee_25s_linear_infinite] whitespace-nowrap" aria-hidden>
          {BRANDS.map((brand) => (
            <span key={brand} className="text-2xl font-black text-gray-200 hover:text-gray-400 transition-colors cursor-default select-none">
              {brand}
            </span>
          ))}
        </div>

        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-gray-50 to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none" />
      </div>
    </section>
  )
}
