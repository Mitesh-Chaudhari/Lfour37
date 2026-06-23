// 'use client'

// import Link from 'next/link'
// import Image from 'next/image'
// import { useMemo, useState } from 'react'
// import { ChevronDown, ChevronRight } from 'lucide-react'
// import { cn } from '@/lib/utils'

// type CategoryNode = {
//   id: string
//   name: string
//   slug: string
//   parent_id: string | null
//   image_url?: string | null
//   children?: CategoryNode[]
// }

// function buildTree(categories: CategoryNode[]) {
//   const map = new Map<string, CategoryNode & { children: CategoryNode[] }>()
//   const roots: (CategoryNode & { children: CategoryNode[] })[] = []

//   categories.forEach((cat) => {
//     map.set(cat.id, { ...cat, children: [] })
//   })

//   categories.forEach((cat) => {
//     const node = map.get(cat.id)
//     if (!node) return

//     if (cat.parent_id) {
//       map.get(cat.parent_id)?.children.push(node)
//     } else {
//       roots.push(node)
//     }
//   })

//   return roots
// }

// function CategoryTile({
//   category,
//   activeSlug,
// }: {
//   category: CategoryNode
//   activeSlug?: string
// }) {
//   const active = activeSlug === category.slug

//   return (
//     <Link
//       href={`/products?category=${category.slug}`}
//       className={cn(
//         'group flex flex-col items-center rounded-lg transition-all',
//         active && 'bg-purple-50'
//       )}
//     >
//       <div
//         className={cn(
//           'relative h-16 w-16 overflow-hidden rounded-md border bg-gray-100',
//           active ? 'border-purple-500' : 'border-gray-200'
//         )}
//       >
//         {category.image_url ? (
//           <Image
//             src={category.image_url}
//             alt={category.name}
//             fill
//             className="object-cover"
//           />
//         ) : (
//           <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-400">
//             {category.name.slice(0, 2).toUpperCase()}
//           </div>
//         )}
//       </div>
//       <span className="mt-1 max-w-[72px] text-center text-[11px] leading-tight text-gray-700 group-hover:text-purple-600">
//         {category.name}
//       </span>
//     </Link>
//   )
// }

// function SectionBlock({
//   title,
//   slug,
//   children,
//   activeSlug,
// }: {
//   title: string
//   slug: string
//   children: React.ReactNode
//   activeSlug?: string
// }) {
//   const [open, setOpen] = useState(
//     activeSlug === slug || activeSlug?.startsWith(slug)
//   )

//   return (
//     <div className="border-b border-gray-100 py-4">
//       <div className="flex items-center justify-between gap-2">
//         <Link
//           href={`/products?category=${slug}`}
//           className="text-sm font-semibold uppercase tracking-wide text-gray-900 hover:text-purple-600"
//         >
//           {title}
//         </Link>

//         <button
//           type="button"
//           onClick={() => setOpen((v) => !v)}
//           className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
//         >
//           <ChevronDown
//             className={cn(
//               'h-4 w-4 transition-transform',
//               open ? 'rotate-180' : 'rotate-0'
//             )}
//           />
//         </button>
//       </div>

//       {open && <div className="mt-3">{children}</div>}
//     </div>
//   )
// }

// function renderLevelTwo(
//   nodes: CategoryNode[],
//   activeSlug?: string
// ) {
//   return (
//     <div className="space-y-4">
//       {nodes.map((node) => {
//         const hasChildren = !!node.children?.length
//         return (
//           <div key={node.id} className="space-y-2">
//             {hasChildren ? (
//               <>
//                 <div className="flex items-center gap-2">
//                   <ChevronRight className="h-4 w-4 text-gray-400" />
//                   <Link
//                     href={`/products?category=${node.slug}`}
//                     className="text-sm font-medium text-gray-800 hover:text-purple-600"
//                   >
//                     {node.name}
//                   </Link>
//                 </div>

//                 <div className="ml-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
//                   {node.children!.map((leaf) => (
//                     <CategoryTile
//                       key={leaf.id}
//                       category={leaf}
//                       activeSlug={activeSlug}
//                     />
//                   ))}
//                 </div>
//               </>
//             ) : (
//               <CategoryTile
//                 category={node}
//                 activeSlug={activeSlug}
//               />
//             )}
//           </div>
//         )
//       })}
//     </div>
//   )
// }

// export function CategorySidebar({
//   categories,
//   activeCategorySlug,
// }: {
//   categories: CategoryNode[]
//   activeCategorySlug?: string
// }) {
//   const tree = useMemo(() => buildTree(categories), [categories])

//   return (
//     <aside className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-4">
//       <div className="mb-3 flex items-center justify-between">
//         <h2 className="text-sm font-semibold text-gray-900">Shop By Category</h2>
//         <Link href="/products" className="text-xs text-purple-600 hover:underline">
//           View all
//         </Link>
//       </div>

//       <div className="space-y-2">
//         {tree.map((root) => (
//           <SectionBlock
//             key={root.id}
//             title={root.name}
//             slug={root.slug}
//             activeSlug={activeCategorySlug}
//           >
//             {renderLevelTwo(root.children || [], activeCategorySlug)}
//           </SectionBlock>
//         ))}
//       </div>
//     </aside>
//   )
// }