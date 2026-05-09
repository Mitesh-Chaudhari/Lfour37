'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

// Dynamic CKEditor component
const CKEditor = dynamic(
    () => import('@ckeditor/ckeditor5-react').then(mod => mod.CKEditor),
    { ssr: false }
)

export default function PageEditor({ page }: any) {
    console.log('PAGE DATA:', page)
    const supabase = createClient()

    const [content, setContent] = useState(page?.content || '')
    const [loading, setLoading] = useState(false)
    const [editor, setEditor] = useState<any>(null)

    // Load ClassicEditor ONLY on client
    useEffect(() => {
        import('@ckeditor/ckeditor5-build-classic').then((mod) => {
            setEditor(() => mod.default)
        })
    }, [])

    const handleSave = async () => {
          console.log('CONTENT:', content)
        if (!page?.id) {
            toast.error('Page ID missing')
            return
        }

        setLoading(true)

        const { data, error } = await supabase
            .from('pages')
            .update({
                content,
                updated_at: new Date().toISOString(),
            })
            .eq('id', page.id)
            .select()

        console.log('UPDATED:', data)
        console.log('ERROR:', error)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success('Updated successfully')
        }

        setLoading(false)
    }

    // Prevent render until editor is loaded
    if (!editor) return <p>Loading editor...</p>
    if (!page?.id) {
        toast.error('Invalid page')
        return
    }
    if (!page) {
        return <p className="text-red-500">Page not found</p>
    }

    return (
        <div className="space-y-4">
            {/* Editor */}
            <div className="bg-white border rounded-lg p-2">
                <CKEditor
                    editor={editor}
                    data={content}
                    onChange={(event: any, editorInstance: any) => {
                        setContent(editorInstance.getData())
                    }}
                    config={{
                        toolbar: [
                            'heading',
                            '|',
                            'bold',
                            'italic',
                            'link',
                            'bulletedList',
                            'numberedList',
                            '|',
                            'undo',
                            'redo',
                        ],
                    }}
                />
            </div>

            {/* Save */}
            <Button onClick={handleSave} loading={loading}>
                Save
            </Button>
        </div>
    )
}