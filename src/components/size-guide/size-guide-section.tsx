import type { SizeGuide } from '@/lib/size-guides'

interface SizeGuideSectionProps {
  guide: SizeGuide
  index: number
}

export function SizeGuideSection({ guide, index }: SizeGuideSectionProps) {
  const titleSuffix = guide.subtitle ? ` (${guide.subtitle})` : ''

  return (
    <section className="rounded-2xl border border-[#d9c4a5] bg-[#faf6ef] p-4 sm:p-6">
      <h2 className="text-base sm:text-lg font-bold text-[#3b2f2f] mb-4">
        ⭐ {index}. {guide.title}
        {titleSuffix}
      </h2>

      <div className="overflow-x-auto rounded-xl border border-[#d9c4a5]">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#e8d5b7] text-[#3b2f2f]">
              <th className="border border-[#d9c4a5] px-3 py-2 text-left font-bold">Size</th>
              <th className="border border-[#d9c4a5] px-3 py-2 text-left font-bold">Chest (in)</th>
              <th className="border border-[#d9c4a5] px-3 py-2 text-left font-bold">Shoulder (in)</th>
              <th className="border border-[#d9c4a5] px-3 py-2 text-left font-bold">Length (in)</th>
              <th className="border border-[#d9c4a5] px-3 py-2 text-left font-bold">Ideal Fit For</th>
            </tr>
          </thead>
          <tbody className="bg-white text-[#3b2f2f]">
            {(guide.rows || []).map((row) => (
              <tr key={row.id}>
                <td className="border border-[#d9c4a5] px-3 py-2 font-semibold">{row.size_label}</td>
                <td className="border border-[#d9c4a5] px-3 py-2">{row.chest}</td>
                <td className="border border-[#d9c4a5] px-3 py-2">{row.shoulder}</td>
                <td className="border border-[#d9c4a5] px-3 py-2">{row.length}</td>
                <td className="border border-[#d9c4a5] px-3 py-2">{row.ideal_fit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface SizeGuideListProps {
  guides: SizeGuide[]
}

export function SizeGuideList({ guides }: SizeGuideListProps) {
  if (!guides.length) {
    return (
      <p className="text-gray-600">
        Size guide information is not available yet. Please check back soon.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {guides.map((guide, index) => (
        <SizeGuideSection key={guide.id} guide={guide} index={index + 1} />
      ))}
    </div>
  )
}
