'use client'
import { Suspense } from 'react'
import TryOnPageContent from './try-on-page-content'

export default function Page() {
  return (
    <Suspense>
      <TryOnPageContent />
    </Suspense>
  )
}