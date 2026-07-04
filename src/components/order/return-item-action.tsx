'use client'

import { useState } from 'react'
import { Button } from '../ui/button'
import ReturnModal from './return-modal'

export default function ReturnItemActions({ item }: any) {
    const [mode, setMode] = useState<'return' | 'exchange' | null>(null)

    if (item.status === 'returned' || item.status === 'exchanged') {
        return (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                {item.status === 'exchanged' ? 'Exchanged' : 'Returned'}
            </span>
        )
    }

    return (
        <>
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMode('return')}
                >
                    Return
                </Button>

                <Button
                    size="sm"
                    className="text-white cancel-order-btn"
                    onClick={() => setMode('exchange')}
                >
                    Exchange
                </Button>
            </div>

            {mode && (
                <ReturnModal
                    item={item}
                    mode={mode}
                    onClose={() => setMode(null)}
                />
            )}
        </>
    )
}