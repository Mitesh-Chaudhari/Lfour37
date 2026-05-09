import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{
    slug: string
  }>
}

export default async function CmsPage({ params }: Props) {
  const { slug } = await params

  const supabase = await createClient()

  const { data: page, error } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .single()

  console.log('PAGE:', page)
  console.log('ERROR:', error)

  if (!page) {
    notFound()
  }

  return (
    <>
        <div className="px-4 py-3 bg-primary-400">
            <h1 className="text-3xl font-bold container mx-auto max-w-4xl">
                {page.title}
            </h1>
        </div>
        <div className="container mx-auto px-4 py-5 max-w-4xl">
            <div
                className="prose prose-gray max-w-none"
                dangerouslySetInnerHTML={{
                __html: page.content || '',
                }}
            />
        </div>
    </>
  )
}