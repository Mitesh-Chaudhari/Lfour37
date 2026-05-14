'use client'

import { useState } from 'react'
import { Button } from '../ui/button'
import ReturnModal from './return-modal'

export default function ReturnItemActions({ item }: any) {
    const [open, setOpen] = useState(false)

    if (item.status === 'Returned') {
        return (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                Returned
            </span>
        )
    }

    return (
        <>
            <Button
                size="sm"
                className="text-white cancel-order-btn"
                onClick={() => setOpen(true)}
            >
                Return Item
            </Button>

            {open && (
                <ReturnModal
                    item={item}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}