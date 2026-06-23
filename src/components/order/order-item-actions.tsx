'use client'

import { useState } from 'react'
import CancelModal from './cancel-modal'
import { Button } from '../ui/button'

export default function OrderItemActions({ item }: any) {
    const [open, setOpen] = useState(false)

    if (
        item.status === 'cancelled' ||
        item.status === 'cancel_requested'
    ) {
        return null
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