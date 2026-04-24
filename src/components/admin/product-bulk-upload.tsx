'use client'

import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export function ProductBulkUpload() {
  const [isUploading, setIsUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }

    setIsUploading(true)
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map((h) => h.trim())

    const supabase = createClient()
    let successCount = 0
    let errorCount = 0

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = values[idx] || '' })

      if (!row.name || !row.price) continue

      try {
        const { error } = await supabase.from('products').insert({
          name: row.name,
          slug: row.slug || row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          price: Number(row.price),
          compare_price: row.compare_price ? Number(row.compare_price) : null,
          description: row.description || null,
          sku: row.sku || null,
          status: (row.status || 'draft') as 'active' | 'inactive' | 'draft',
          images: [],
          tags: row.tags ? row.tags.split(';') : [],
        })

        if (error) errorCount++
        else successCount++
      } catch {
        errorCount++
      }
    }

    toast.success(`Uploaded ${successCount} products${errorCount > 0 ? `, ${errorCount} errors` : ''}`)
    setIsUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      <input
        type="file"
        accept=".csv"
        ref={fileRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        loading={isUploading}
      >
        <Upload className="h-4 w-4" /> Bulk Upload CSV
      </Button>
    </>
  )
}
