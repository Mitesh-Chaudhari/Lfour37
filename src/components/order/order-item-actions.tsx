'use client'

import { useState } from 'react'
import CancelModal from './cancel-modal'
import { Button } from '../ui/button'

export default function OrderItemActions({ item }: any) {
    const [open, setOpen] = useState(false)

    if (item.status === 'cancelled') {
        return (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                Cancelled
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
                Cancel Order
            </Button>

            {open && (
                <CancelModal
                    itemId={item.id}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}