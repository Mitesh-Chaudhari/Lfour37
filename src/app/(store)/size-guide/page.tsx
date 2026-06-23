import type { Metadata } from 'next'
import { getActiveSizeGuides } from '@/lib/size-guides'
import { SizeGuideList } from '@/components/size-guide/size-guide-section'

export const metadata: Metadata = {
  title: 'Size Guide',
  description: 'Find your perfect fit with the Lfour37 size guide.',
}

export default async function SizeGuidePage() {
  const guides = await getActiveSizeGuides()

  return (
    <>
      <div className="px-4 py-3 bg-primary-400">
        <h1 className="text-3xl font-bold container mx-auto max-w-5xl">Size Guide</h1>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <SizeGuideList guides={guides} />
      </div>
    </>
  )
}
