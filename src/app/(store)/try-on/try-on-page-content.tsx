'use client'

import {
    useSearchParams,
    useRouter,
} from 'next/navigation'

import {
    useState,
} from 'react'

import Image from 'next/image'
import { OptimizedImage } from '@/components/ui/optimized-image'

import toast from 'react-hot-toast'

import {
    Upload,
    Sparkles,
    RefreshCcw,
} from 'lucide-react'

import { Button }
    from '@/components/ui/button'

export default function TryOnPageContent() {
    const router = useRouter()
    const params =
        useSearchParams()

    const productImage =
        params.get('product')

    const productName =
        params.get('name')

    const color =
        params.get('color')

    const [
        personImage,
        setPersonImage,
    ] =
        useState<File | null>(null)

    const [
        preview,
        setPreview,
    ] =
        useState<string>('')

    const [
        result,
        setResult,
    ] =
        useState('')

    const [
        loading,
        setLoading,
    ] =
        useState(false)

    const handleUpload = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file =
            e.target.files?.[0]

        if (!file) return

        // validate
        if (
            file.size >
            10 * 1024 * 1024
        ) {
            toast.error(
                'Max image size is 10MB'
            )
            return
        }

        setPersonImage(file)

        setPreview(
            URL.createObjectURL(file)
        )
    }

    const handleGenerate =
        async (regenerate = false) => {
            if (!personImage) {
                toast.error(
                    'Upload your image'
                )
                return
            }

            if (!productImage) {
                toast.error(
                    'Product image missing'
                )
                return
            }

            setLoading(true)

            // setResult('')

            try {
                const formData =
                    new FormData()

                formData.append(
                    'person',
                    personImage
                )

                formData.append(
                    'productImage',
                    productImage
                )

                formData.append(
                    'productId',
                    params.get('productId') || ''
                )

                formData.append(
                    'forceRegenerate',
                    regenerate
                        ? 'true'
                        : 'false'
                )

                const res =
                    await fetch(
                        '/api/virtual-try-on',
                        {
                            method: 'POST',
                            body: formData,
                        }
                    )
                // Check if response is Unauthorized (401)
                // Inside handleGenerate on your try-on page:
                if (res.status === 401) {
                    toast.error('Please log in to continue')
                    // Capture the entire relative path along with all original query parameters
                    const currentUrl = encodeURIComponent(window.location.pathname + window.location.search)
                    
                    // Uses 'redirectTo' to align perfectly with your LoginForm state configuration
                    router.push(`/login?redirectTo=${currentUrl}`)
                    return
                }

                const data =
                    await res.json()

                if (!res.ok) {
                    toast.error(
                        data.error ||
                        'Generation failed'
                    )

                    return
                }

                setResult(data.image)

                toast.success(
                    'Try-on generated!'
                )

            } catch (err) {
                console.error(err)

                toast.error(
                    'Failed to generate try-on'
                )
            } finally {
                setLoading(false)
            }
        }

    return (
        <div className="container mx-auto px-4 py-10">

            <div className="max-w-7xl mx-auto">

                {/* HEADER */}

                <div className="mb-8">
                    <h1 className="text-3xl font-bold">
                        Virtual Try-On
                    </h1>

                    <p className="text-gray-500 mt-2">
                        Upload your image and preview the outfit instantly
                    </p>
                </div>

                {/* GRID */}

                <div className="grid lg:grid-cols-3 gap-6">

                    {/* PRODUCT */}

                    <div className="bg-white rounded-3xl border p-5">

                        <h2 className="font-semibold text-lg mb-4">
                            Product
                        </h2>

                        {productImage ? (
                            <>
                                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100">

                                    <OptimizedImage
                                        src={decodeURIComponent(productImage)}
                                        alt="Product"
                                        fill
                                        variant="gallery"
                                        className="object-cover"
                                    />
                                </div>

                                {productName && (
                                    <p className="mt-3 text-sm text-gray-700 font-medium">
                                        {productName}
                                    </p>
                                )}
                                {color && (
                                    <p className="text-sm text-purple-600 mt-1">
                                        Color: {color}
                                    </p>
                                )}
                            </>
                        ) : (
                            <div className="h-[500px] rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
                                Product image missing
                            </div>
                        )}
                    </div>

                    {/* PERSON */}

                    <div className="bg-white rounded-3xl border p-5">

                        <h2 className="font-semibold text-lg mb-4">
                            Upload Your Photo
                        </h2>

                        <label className="border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer min-h-[500px] hover:border-purple-400 transition-all">

                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleUpload}
                            />

                            {preview ? (
                                <div className="relative w-full h-[450px]">

                                    <Image
                                        src={preview}
                                        alt="Preview"
                                        fill
                                        unoptimized
                                        className="object-cover rounded-xl"
                                    />
                                </div>
                            ) : (
                                <>
                                    <Upload className="h-12 w-12 text-gray-400" />

                                    <p className="text-sm text-gray-500 mt-4">
                                        Upload front-facing image
                                    </p>

                                    <p className="text-xs text-gray-400 mt-1">
                                        JPG, PNG up to 10MB
                                    </p>
                                </>
                            )}
                        </label>
                    </div>

                    {/* RESULT */}

                    <div className="bg-white rounded-3xl border p-5">

                        <div className="flex items-center justify-between mb-4">

                            <h2 className="font-semibold text-lg">
                                Result
                            </h2>

                            {result && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={loading}
                                    onClick={() =>
                                        handleGenerate(true)
                                    }
                                    >
                                    <RefreshCcw className="h-4 w-4" />

                                    Regenerate
                                </Button>
                            )}
                        </div>

                        <div className="min-h-[500px] rounded-2xl bg-gray-50 flex items-center justify-center overflow-hidden relative">

                            {loading ? (
                                <div className="text-center px-6">

                                    <div className="h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />

                                    <p className="mt-5 text-sm font-medium text-gray-700">
                                        Generating AI try-on...
                                    </p>

                                    <p className="text-xs text-gray-400 mt-2">
                                        This may take 20–40 seconds
                                    </p>
                                </div>
                            ) : result ? (
                                <div className="relative w-full h-[500px]">

                                    <Image
                                        src={result}
                                        alt="Result"
                                        fill
                                        unoptimized
                                        className="object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="text-center px-6">
                                    <Sparkles className="h-12 w-12 text-gray-300 mx-auto" />

                                    <p className="text-sm text-gray-400 mt-4">
                                        Generated try-on will appear here
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* BUTTON */}

                <div className="mt-8 flex justify-center">

                    <Button
                        size="lg"
                        onClick={() =>
                            handleGenerate(false)
                        }                        
                        loading={loading}
                        disabled={loading}
                        className="min-w-[220px]"
                    >
                        <Sparkles className="h-5 w-5" />

                        Generate Try-On
                    </Button>
                </div>
            </div>
        </div>
    )
}